// src/app/page.jsx
"use client";

import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Error en la respuesta del servidor");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error("Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>🏥 Consulta Clínica</h1>
      <p className={styles.subtitle}>
        Preguntá por pacientes, facturas, siniestros, UTI o cirugías.
      </p>

      <div className={styles.chatBox}>
        {message && <div className={styles.userMessage}>{message}</div>}

        {loading && (
          <div className={styles.loading}>Analizando tu consulta con IA...</div>
        )}

        {error && (
          <div className={styles.aiResponse} style={{ borderLeft: "4px solid #dc2626" }}>
            <p style={{ color: "#dc2626", margin: 0 }}>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {result && !error && (
          <div className={styles.aiResponse}>
            {/* Filtros que extrajo la IA */}
            <p>
              <strong>Filtros aplicados:</strong>
            </p>
            <div className={styles.filtersApplied}>
              <ul>
                <li>
                  Entidad: <strong>{result.filters?.entidad || "—"}</strong>
                </li>
                {result.filters?.artSeguro && (
                  <li>
                    Obra social: <strong>{result.filters.artSeguro}</strong>
                  </li>
                )}
                {result.filters?.dni && (
                  <li>
                    DNI: <strong>{result.filters.dni}</strong>
                  </li>
                )}
                {result.filters?.pacienteNombre && (
                  <li>
                    Paciente: <strong>{result.filters.pacienteNombre}</strong>
                  </li>
                )}
                {result.filters?.estado && (
                  <li>
                    Estado: <strong>{result.filters.estado}</strong>
                  </li>
                )}
                {result.filters?.activo !== undefined && (
                  <li>
                    Activo: <strong>{String(result.filters.activo)}</strong>
                  </li>
                )}
                {result.filters?.fechaDesde && (
                  <li>
                    Desde: <strong>{result.filters.fechaDesde}</strong>
                  </li>
                )}
                {result.filters?.fechaHasta && (
                  <li>
                    Hasta: <strong>{result.filters.fechaHasta}</strong>
                  </li>
                )}
                {result.filters?.totalMin && (
                  <li>
                    Total mín: <strong>${result.filters.totalMin.toLocaleString("es-AR")}</strong>
                  </li>
                )}
              </ul>
            </div>

            {/* Caso 1: respuesta tipo conteo */}
            {result.mensaje && !result.results && (
              <p style={{ marginTop: "1rem", fontSize: "1.1rem" }}>
                <strong>{result.mensaje}</strong>
              </p>
            )}

            {/* Caso 2: respuesta tipo lista */}
            {Array.isArray(result.results) && result.results.length > 0 && (
              <>
                <p>
                  Encontré <strong>{result.total}</strong> resultado(s):
                </p>
                <div className={styles.productGrid}>
                  {result.results.map((item, idx) => (
                    <div key={item.id || idx} className={styles.productCard}>
                      <h3 className={styles.productName}>
                        {item.paciente?.nombreCompleto ||
                          item.pacienteDatos?.nombreCompleto ||
                          item.nombre ||
                          item.paciente ||
                          "Sin nombre"}
                      </h3>
                      <p className={styles.productDescription}>
                        {item.paciente?.artSeguro ||
                          item.pacienteDatos?.artSeguro ||
                          item.artSeguro ||
                          item.artKey ||
                          "—"}
                      </p>
                      <div className={styles.productMeta}>
                        <span>
                          DNI:{" "}
                          {item.paciente?.dni ||
                            item.pacienteDatos?.dni ||
                            item.dni ||
                            "—"}
                        </span>
                        {item.estado && <span>Estado: {item.estado}</span>}
                      </div>
                      {item.totales?.total && (
                        <p className={styles.productPrice}>
                          ${item.totales.total.toLocaleString("es-AR")}
                        </p>
                      )}
                      {item.fechaAtencion && (
                        <p style={{ fontSize: "0.85rem", color: "#888" }}>
                          Fecha: {item.fechaAtencion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Caso 3: lista vacía */}
            {Array.isArray(result.results) && result.results.length === 0 && (
              <p className={styles.noResults}>
                😔 No se encontraron resultados con esos filtros.
              </p>
            )}
          </div>
        )}

        {!message && !result && !loading && !error && (
          <p style={{ textAlign: "center", color: "#999" }}>
            Ejemplos:
            <br />
            &ldquo;¿Cuántas facturas hay de IAPS ART?&rdquo;
            <br />
            &ldquo;¿Qué pacientes están internados en UTI ahora?&rdquo;
            <br />
            &ldquo;Busca al paciente con DNI 25620629&rdquo;
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className={styles.inputArea}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribí tu consulta..."
          className={styles.input}
          disabled={loading}
        />
        <button
          type="submit"
          className={styles.button}
          disabled={loading || !message.trim()}
        >
          {loading ? "Buscando..." : "Consultar"}
        </button>
      </form>
    </main>
  );
}