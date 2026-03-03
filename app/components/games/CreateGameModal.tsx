"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { createGame, type GameQuestion } from "../../lib/game-service";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: GameQuestion;
  index: number;
  onChange: (q: GameQuestion) => void;
  onRemove: () => void;
}) {
  const updateOption = (optIndex: number, value: string) => {
    const options = [...question.options];
    options[optIndex] = value;
    onChange({ ...question, options });
  };

  const addOption = () => {
    if (question.options.length >= 6) return;
    onChange({ ...question, options: [...question.options, ""] });
  };

  const removeOption = (optIndex: number) => {
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, i) => i !== optIndex);
    const correctIndex =
      question.correctIndex === optIndex
        ? 0
        : question.correctIndex > optIndex
        ? question.correctIndex - 1
        : question.correctIndex;
    onChange({ ...question, options, correctIndex });
  };

  const optionColors = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71", "#9b59b6", "#1abc9c"];

  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Question {index + 1}
        </span>
        <button
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{ color: "var(--danger)" }}
        >
          ✕ Remove
        </button>
      </div>

      <input
        type="text"
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
        placeholder="Enter your question..."
        className="w-full px-3 py-2 rounded text-sm outline-none mb-3"
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />

      <div className="space-y-2 mb-3">
        {question.options.map((opt, optIdx) => (
          <div key={optIdx} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...question, correctIndex: optIdx })}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
              style={{
                background: question.correctIndex === optIdx ? optionColors[optIdx] : "var(--bg-primary)",
                color: question.correctIndex === optIdx ? "white" : "var(--text-muted)",
                border: `2px solid ${optionColors[optIdx]}`,
              }}
              title={question.correctIndex === optIdx ? "Correct answer" : "Mark as correct"}
            >
              {question.correctIndex === optIdx ? "✓" : String.fromCharCode(65 + optIdx)}
            </button>
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(optIdx, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
              className="flex-1 px-3 py-1.5 rounded text-sm outline-none"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: `1px solid ${question.correctIndex === optIdx ? optionColors[optIdx] : "var(--border)"}`,
              }}
            />
            {question.options.length > 2 && (
              <button
                onClick={() => removeOption(optIdx)}
                className="text-xs px-1 hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {question.options.length < 6 && (
        <button
          onClick={addOption}
          className="text-xs hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          + Add option
        </button>
      )}

      <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Click a letter to mark the correct answer
      </div>
    </div>
  );
}

export default function CreateGameModal({ onClose, onCreated }: Props) {
  const keys = useAppStore((s) => s.keys);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timePerQuestion, setTimePerQuestion] = useState(20);
  const [questions, setQuestions] = useState<GameQuestion[]>([
    { text: "", options: ["", "", "", ""], correctIndex: 0 },
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const addQuestion = () => {
    setQuestions([...questions, { text: "", options: ["", "", "", ""], correctIndex: 0 }]);
  };

  const updateQuestion = (index: number, q: GameQuestion) => {
    const updated = [...questions];
    updated[index] = q;
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!keys) return;
    setError("");

    // Validate
    if (!title.trim()) { setError("Title is required"); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setError(`Question ${i + 1} needs text`); return; }
      if (q.options.some((o) => !o.trim())) { setError(`Question ${i + 1} has empty options`); return; }
    }

    setCreating(true);
    try {
      await createGame(
        { title: title.trim(), description: description.trim(), timePerQuestion, questions },
        keys.publicKey
      );
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl"
        style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Create Quiz Game</h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Game info */}
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 5 Review Quiz"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this quiz cover?"
              rows={2}
              className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Time per question (seconds)</label>
            <div className="flex items-center gap-3">
              {[10, 15, 20, 30, 45, 60].map((t) => (
                <button
                  key={t}
                  onClick={() => setTimePerQuestion(t)}
                  className="px-3 py-1 rounded text-sm"
                  style={{
                    background: timePerQuestion === t ? "var(--accent)" : "var(--bg-tertiary)",
                    color: timePerQuestion === t ? "white" : "var(--text-muted)",
                  }}
                >
                  {t}s
                </button>
              ))}
            </div>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Questions ({questions.length})
              </label>
              <button
                onClick={addQuestion}
                className="text-sm px-3 py-1 rounded"
                style={{ background: "var(--bg-tertiary)", color: "var(--accent)" }}
              >
                + Add Question
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionEditor
                  key={i}
                  question={q}
                  index={i}
                  onChange={(updated) => updateQuestion(i, updated)}
                  onRemove={() => removeQuestion(i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          {error && (
            <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded text-sm" style={{ color: "var(--text-muted)" }}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {creating ? "Creating..." : "Create Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
