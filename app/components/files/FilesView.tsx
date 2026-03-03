"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../lib/store";
import { uploadBlob, listBlobs, deleteBlob, getBlobUrl, type BlobDescriptor } from "../../lib/blossom";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(type?: string): string {
  if (!type) return "📄";
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎵";
  if (type.startsWith("text/")) return "📝";
  if (type.includes("pdf")) return "📕";
  if (type.includes("zip") || type.includes("tar") || type.includes("gz")) return "📦";
  if (type.includes("json") || type.includes("xml")) return "🔧";
  return "📄";
}

export default function FilesView() {
  const keys = useAppStore((s) => s.keys);
  const [blobs, setBlobs] = useState<BlobDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBlobs = async () => {
    if (!keys) return;
    setLoading(true);
    try {
      const list = await listBlobs(keys.publicKey);
      setBlobs(list.sort((a, b) => b.created - a.created));
    } catch (err) {
      console.error("Failed to list blobs:", err);
      setBlobs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBlobs();
  }, [keys]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!keys) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const blob = await uploadBlob(file, keys.privateKey);
        setBlobs((prev) => [blob, ...prev]);
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
      setBlobs((prev) => prev.filter((b) => b.sha256 !== sha256));
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

  return (
    <div
      className="flex-1 flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-6 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Files</h2>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
            BLOSSOM Storage
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              onClick={() => setViewMode("list")}
              className="px-2 py-1 text-xs cursor-pointer"
              style={{ background: viewMode === "list" ? "var(--accent)" : "var(--bg-tertiary)", color: viewMode === "list" ? "white" : "var(--text-muted)" }}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className="px-2 py-1 text-xs cursor-pointer"
              style={{ background: viewMode === "grid" ? "var(--accent)" : "var(--bg-tertiary)", color: viewMode === "grid" ? "white" : "var(--text-muted)" }}
            >
              ⊞
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-1.5 rounded text-sm cursor-pointer disabled:opacity-50"
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
        <div className="mx-6 mt-3 p-3 rounded text-sm" style={{ background: "rgba(237,66,69,0.15)", color: "var(--danger)" }}>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>Loading files...</div>
        ) : blobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: "var(--text-muted)" }}>
            <div className="text-5xl mb-4">📁</div>
            <p className="text-sm mb-2">No files yet</p>
            <p className="text-xs">Upload files or drag &amp; drop them here</p>
          </div>
        ) : viewMode === "list" ? (
          /* List view */
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="grid grid-cols-[1fr_100px_160px_60px] gap-4 px-4 py-2 text-xs font-medium" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
              <span>Name</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span></span>
            </div>
            {blobs.map((blob) => (
              <div
                key={blob.sha256}
                className="grid grid-cols-[1fr_100px_160px_60px] gap-4 px-4 py-3 items-center text-sm transition-colors"
                style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
              >
                <a
                  href={getBlobUrl(blob.sha256)}
                  target="_blank"
                  className="flex items-center gap-2 truncate hover:underline"
                  style={{ color: "var(--accent-light)" }}
                >
                  <span>{getFileIcon(blob.type)}</span>
                  <span className="truncate">{blob.sha256.slice(0, 12)}...{blob.type ? `.${blob.type.split("/")[1]}` : ""}</span>
                </a>
                <span style={{ color: "var(--text-muted)" }}>{formatBytes(blob.size)}</span>
                <span style={{ color: "var(--text-muted)" }}>{formatDate(blob.created)}</span>
                <button
                  onClick={() => handleDelete(blob.sha256)}
                  className="text-xs cursor-pointer px-2 py-1 rounded"
                  style={{ color: "var(--danger)" }}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {blobs.map((blob) => {
              const isImage = blob.type?.startsWith("image/");
              return (
                <div
                  key={blob.sha256}
                  className="rounded-lg overflow-hidden group"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <a href={getBlobUrl(blob.sha256)} target="_blank" className="block">
                    {isImage ? (
                      <div className="h-36 overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                        <img src={getBlobUrl(blob.sha256)} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-36 flex items-center justify-center text-4xl" style={{ background: "var(--bg-tertiary)" }}>
                        {getFileIcon(blob.type)}
                      </div>
                    )}
                  </a>
                  <div className="p-3">
                    <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                      {blob.sha256.slice(0, 16)}...
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{formatBytes(blob.size)}</span>
                      <button
                        onClick={() => handleDelete(blob.sha256)}
                        className="text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--danger)" }}
                      >
                        🗑
                      </button>
                    </div>
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
