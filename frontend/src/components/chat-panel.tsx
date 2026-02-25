"use client";

import { useRef, useEffect } from "react";
import { useChat } from "ai/react";

interface ChatPanelProps {
  projectId?: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "/api/chat",
    body: { project_id: projectId ?? "PORTFOLIO" },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[32rem] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div>
          <h3 className="font-semibold text-sm">AI Assistant</h3>
          <span className="text-xs text-gray-400">
            {projectId ? `Project: ${projectId}` : "Portfolio"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 text-center mt-8">
            <p className="mb-2">Ask me about this project&apos;s financials.</p>
            <div className="space-y-1 text-xs text-gray-600">
              <p>&quot;What&apos;s causing the labor overruns?&quot;</p>
              <p>&quot;Show me the change orders&quot;</p>
              <p>&quot;What if we recover 10% of labor costs?&quot;</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={`text-sm ${
                msg.role === "user"
                  ? "ml-8 bg-blue-600/20 border border-blue-500/30 rounded-lg p-2.5"
                  : "mr-4 bg-gray-800 rounded-lg p-2.5"
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">
                {msg.role === "user" ? "You" : "AI Agent"}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>

            {/* Tool call indicators */}
            {msg.toolInvocations && msg.toolInvocations.length > 0 && (
              <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-2 mt-1 space-y-1">
                {msg.toolInvocations.map((tc, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-blue-400">&#9881;</span>
                    {tc.toolName}({JSON.stringify(tc.args).slice(0, 80)})
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about this project..."
            disabled={isLoading}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
