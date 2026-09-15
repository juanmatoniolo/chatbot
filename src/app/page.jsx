// src/app/page.jsx
"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // {id, role, text, data, error}
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Historial de filtros ya resueltos, para preguntas de seguimiento
    const historial = messages
      .filter((m) => m.role === "assistant" && m.data?.filters)
      .slice(-3)
      .map((m) => m.data.filters);

    try {
      const res = await fetch("/api/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, historial }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error en la respuesta del servidor");

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", data }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", error: err.message },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>🏥 Consulta Clínica</h1>
        <p className={styles.subtitle}>Pacientes, facturas, siniestros, UTI o cirugías</p>
      </header>

      <div ref={scrollRef} className={styles.history}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <p>Ejemplos de consulta</p>
            <ul>
              <li>&ldquo;¿Cuántas facturas hay de IAPS ART?&rdquo;</li>
              <li>&ldquo;¿Qué pacientes están en UTI ahora?&rdquo;</li>
              <li>&ldquo;Busca al paciente con DNI 25620629&rdquo;</li>
            </ul>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className={styles.rowUser}>
              <div className={styles.bubbleUser}>{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className={styles.rowAssistant}>
              <AssistantBubble data={m.data} error={m.error} />
            </div>
          )
        )}

        {loading && (
          <div className={styles.rowAssistant}>
            <div className={styles.typing}>
              <span className={styles.dot} style={{ animationDelay: "0ms" }} />
              <span className={styles.dot} style={{ animationDelay: "150ms" }} />
              <span className={styles.dot} style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí tu consulta..."
            disabled={loading}
            enterKeyHint="send"
            className={styles.input}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className={styles.sendButton}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M4 12L20 4L13 20L11 13L4 12Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

function AssistantBubble({ data, error }) {
  if (error) {
    return (
      <div className={styles.bubbleError}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  const hasList = Array.isArray(data?.results);

  return (
    <div className={styles.bubbleAssistant}>
      {data?.mensaje && !hasList && <p className={styles.mensaje}>{data.mensaje}</p>}

      {hasList && data.results.length > 0 && (
        <>
          <p className={styles.resultCount}>{data.total} resultado(s) encontrado(s)</p>
          <div className={styles.grid}>
            {data.results.map((item, i) => (
              <ResultCard key={item.id || i} item={item} />
            ))}
          </div>
        </>
      )}

      {hasList && data.results.length === 0 && (
        <p className={styles.noResults}>😔 Sin resultados con esos filtros.</p>
      )}
    </div>
  );
}

function ResultCard({ item }) {
  const d = item._display || {};

  return (
    <div className={styles.card}>
      <p className={styles.cardName}>{d.nombre || "Sin nombre"}</p>
      {d.dni && <p className={styles.cardSub}>DNI: {d.dni}</p>}

      {d.extra?.length > 0 && (
        <div className={styles.cardMeta}>
          {d.extra.map((e, i) => (
            <span key={i}>
              {typeof e.value === "boolean" ? (e.value ? "sí" : "no") : String(e.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}