"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../lib/store";
import { uploadBlob, deleteBlob, getBlobUrl, type BlobDescriptor } from "../../lib/blossom";
import { createEvent, KIND_CHANNEL_MESSAGE } from "../../lib/nostr";
import { pool } from "../../lib/relay-pool";

interface MeetingFile {
  blob: BlobDescriptor;
  filename: string;
  uploadedBy: string;
  uploadedAt: number;
  eventId: string;
}

interface Props {
  meetingId: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(type?: string): string {
  if (!type) return "📄";
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎵";
  if (type.startsWith("text/")) return "📝";
  if (type.includes("pdf")) return "📕";
  if (type.includes("zip") || type.includes("tar") || type.includes("gz")) return "📦";
  return "📄";
}

export default function MeetingFiles({ meetingId }: Props) {
  const keys = useAppStore((s) => s.keys);
  const profiles = useAppStore((s) => s.profiles);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load meeting files from Nostr events
  useEffect(() => {
    setLoading(true);
    const meetingFiles: MeetingFile[] = [];

    pool.subscribe(
      `meeting-files-${meetingId}`,
      [
        {
          kinds: [KIND_CHANNEL_MESSAGE],
          "#e": [meetingId],
          "#t": ["meeting-file"],
          limit: 100,
        },
      ],
      (event) => {
        try {
          const parsed = JSON.parse(event.content);
          if (parsed.type !== "meeting-file") return;

          const file: MeetingFile = {
            blob: {
              sha256: parsed.sha256,
              size: parsed.size,
              type: parsed.mimeType,
              url: parsed.url,
              created: event.created_at,
            },
            filename: parsed.filename,
            uploadedBy: event.pubkey,
            uploadedAt: event.created_at,
            eventId: event.id,
          };

          // Deduplicate
          if (!meetingFiles.some((f) => f.blob.sha256 === file.blob.sha256)) {
            meetingFiles.push(file);
            setFiles([...meetingFiles].sort((a, b) => b.uploadedAt - a.uploadedAt));
          }
        } catch {
          // skip
        }
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      pool.unsubscribe(`meeting-files-${meetingId}`);
    };
  }, [meetingId]);

  // Upload and publish link event
  const handleUpload = async (fileList: FileList | File[]) => {
    if (!keys) return;
    setUploading(true);
    setError("");

    try {
      for (const file of Array.from(fileList)) {
        const blob = await uploadBlob(file, keys.privateKey);

        // Publish Nostr event linking file to meeting
        const content = JSON.stringify({
          type: "meeting-file",
          sha256: blob.sha256,
          size: blob.size,
          mimeType: file.type || blob.type,
          url: blob.url,
          filename: file.name,
        });

        const tags: string[][] = [
          ["e", meetingId, "", "root"],
          ["t", "meeting-file"],
          ["x", blob.sha256],
        ];

        const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, keys.privateKey);
        await pool.publish(event);

        const meetingFile: MeetingFile = {
          blob,
          filename: file.name,
          uploadedBy: keys.publicKey,
          uploadedAt: Math.floor(Date.now() / 1000),
          eventId: event.id,
        };

        setFiles((prev) => [meetingFile, ...prev]);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  };

  const handleDelete = async (sha256: string) => {
    if (!keys || !confirm("Delete this file?")) return;
    try {
      await deleteBlob(sha256, keys.privateKey);
      setFiles((prev) => prev.filter((f) => f.blob.sha256 !== sha256));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    return p?.displayName || p?.name || pubkey.slice(0, 8) + "...";
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          📁 Meeting Files ({files.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {uploading ? "Uploading..." : "⬆ Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-2 rounded text-sm" style={{ background: "rgba(237,66,69,0.15)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(98,100,167,0.2)", border: "3px dashed var(--accent)" }}>
          <div className="text-xl font-semibold" style={{ color: "var(--accent-light)" }}>
            Drop files to upload
          </div>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: "var(--text-muted)" }}>
            <div className="text-5xl mb-3">📁</div>
            <p className="text-sm mb-1">No files shared in this meeting</p>
            <p className="text-xs">Upload files or drag & drop them here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const isImage = file.blob.type?.startsWith("image/");
              return (
                <div
                  key={file.blob.sha256}
                  className="flex items-center gap-3 p-3 rounded-lg group"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  {/* Preview / Icon */}
                  {isImage ? (
                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0" style={{ background: "var(--bg-tertiary)" }}>
                      <img src={getBlobUrl(file.blob.sha256)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded flex items-center justify-center text-xl flex-shrink-0" style={{ background: "var(--bg-tertiary)" }}>
                      {getFileIcon(file.blob.type)}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <a
                      href={getBlobUrl(file.blob.sha256)}
                      target="_blank"
                      className="text-sm font-medium truncate block hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {file.filename}
                    </a>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>{formatBytes(file.blob.size)}</span>
                      <span>by {getDisplayName(file.uploadedBy)}</span>
                      <span>{new Date(file.uploadedAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={getBlobUrl(file.blob.sha256)}
                      target="_blank"
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: "var(--accent)" }}
                      title="Download"
                    >
                      ⬇
                    </a>
                    {file.uploadedBy === keys?.publicKey && (
                      <button
                        onClick={() => handleDelete(file.blob.sha256)}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: "var(--danger)" }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
