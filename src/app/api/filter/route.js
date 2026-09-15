// src/app/api/filter/route.js
import { NextResponse } from "next/server";
import { z } from "zod";
import {
	getFacturas,
	getSiniestros,
	getUTI,
	getCirugias,
} from "@/lib/firebase-admin";

// ---------------------------------------------------------------------------
// Esquema de Zod: define lo que la IA debe extraer
// ---------------------------------------------------------------------------
const filterSchema = z.object({
	entidad: z.enum(["factura", "siniestro", "uti", "cirugia"]),
	artSeguro: z.string().optional(),
	dni: z.string().optional(),
	pacienteNombre: z.string().optional(),
	estado: z.enum(["borrador", "cerrado"]).optional(),
	activo: z.boolean().optional(),
	fechaDesde: z.string().optional(),
	fechaHasta: z.string().optional(),
	totalMin: z.number().optional(),
	totalMax: z.number().optional(),
	respuestaEsperada: z.enum(["lista", "conteo", "detalle"]),
});

// ---------------------------------------------------------------------------
// Esquema nativo de Google
// ---------------------------------------------------------------------------
const googleResponseSchema = {
	type: "OBJECT",
	properties: {
		entidad: {
			type: "STRING",
			enum: ["factura", "siniestro", "uti", "cirugia"],
			description: "Qué tipo de registro busca el usuario.",
		},
		artSeguro: {
			type: "STRING",
			description: "Obra social / ART mencionada.",
		},
		dni: { type: "STRING", description: "DNI del paciente, solo dígitos." },
		pacienteNombre: { type: "STRING", description: "Nombre del paciente." },
		estado: {
			type: "STRING",
			enum: ["borrador", "cerrado"],
			description: "Estado del registro. Solo facturas.",
		},
		activo: {
			type: "BOOLEAN",
			description: "Solo UTI: true = internado, false = alta.",
		},
		fechaDesde: { type: "STRING", description: "Fecha mínima ISO 8601." },
		fechaHasta: { type: "STRING", description: "Fecha máxima ISO 8601." },
		totalMin: { type: "NUMBER", description: "Monto total mínimo." },
		totalMax: { type: "NUMBER", description: "Monto total máximo." },
		respuestaEsperada: {
			type: "STRING",
			enum: ["lista", "conteo", "detalle"],
		},
	},
	required: ["entidad", "respuestaEsperada"],
};

// ---------------------------------------------------------------------------
// Helper: llama a Google con fallback entre modelos y reintentos
// ---------------------------------------------------------------------------
async function callGoogleWithFallback({ apiKey, prompt, responseSchema }) {
	const models = [
		"gemini-3.6-flash",
		"gemini-3.6-pro",
		"gemini-2.5-flash",
		"gemini-2.5-pro",
	];

	const MAX_RETRIES_PER_MODEL = 2;
	let lastError = null;

	for (const model of models) {
		for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
			try {
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [{ parts: [{ text: prompt }] }],
						generationConfig: {
							responseMimeType: "application/json",
							responseSchema: responseSchema,
						},
					}),
				});

				if (response.status === 503 || response.status === 429) {
					console.warn(
						`[Google API] ${model} intento ${attempt}/${MAX_RETRIES_PER_MODEL} falló con ${response.status}. Reintentando...`,
					);
					lastError = new Error(
						`${model} no disponible (${response.status})`,
					);
					await new Promise((r) => setTimeout(r, 1000 * attempt));
					continue;
				}

				if (response.status === 404) {
					console.warn(
						`[Google API] ${model} no existe (404). Probando siguiente...`,
					);
					lastError = new Error(`${model} no encontrado`);
					break;
				}

				if (!response.ok) {
					const body = await response.text();
					throw new Error(`Google API ${response.status}: ${body}`);
				}

				console.log(
					`[Google API] Respondió ${model} en intento ${attempt}.`,
				);
				return await response.json();
			} catch (err) {
				lastError = err;
				console.error(`[Google API] Error con ${model}:`, err.message);
				if (attempt < MAX_RETRIES_PER_MODEL) {
					await new Promise((r) => setTimeout(r, 1000 * attempt));
				}
			}
		}
	}

	throw new Error(
		`Todos los modelos fallaron. Último error: ${lastError?.message || "desconocido"}`,
	);
}

// ---------------------------------------------------------------------------
// POST /api/filter
// ---------------------------------------------------------------------------
export async function POST(request) {
	try {
		const { message } = await request.json();

		if (!message || typeof message !== "string" || !message.trim()) {
			return NextResponse.json(
				{ error: 'El campo "message" es requerido.' },
				{ status: 400 },
			);
		}

		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Falta GOOGLE_GENERATIVE_AI_API_KEY en .env.local" },
				{ status: 500 },
			);
		}

		const prompt = `Sos un asistente de una clínica médica. Traducí la pregunta del usuario a filtros estructurados.

Contexto de la base de datos:
- "factura": facturas médicas. Campos: paciente.artSeguro, paciente.dni, paciente.nombreCompleto, estado ("borrador" o "cerrado"), totales.total, paciente.fechaAtencion.
- "siniestro": reclamos de ART. Campos: dni, status, artKey.
- "uti": internaciones. Campos: activo (true/false), paciente, dni, diagnosticoActual.
- "cirugia": cirugías. Campos: doctor, pacienteDatos.dni, fechaEstimada, realizada.

Reglas:
- Si el usuario no especifica entidad, deducila del contexto.
- Si menciona un nombre suelto, buscá en pacienteNombre.
- Si menciona un número de 7-8 dígitos, probablemente sea DNI.
- Para fechas relativas, calculá el rango ISO usando la fecha actual.
- Normalizá los nombres de obras sociales.
- "cuántos" → respuestaEsperada = "conteo".
- "muéstrame X" o "busca a X" → respuestaEsperada = "lista".
- "contame sobre X" → respuestaEsperada = "detalle".

Pregunta del usuario:
"${message.trim()}"`;

		const googleData = await callGoogleWithFallback({
			apiKey,
			prompt,
			responseSchema: googleResponseSchema,
		});

		const jsonText = googleData.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!jsonText) {
			throw new Error("La IA no devolvió una respuesta válida.");
		}

		const parsed = JSON.parse(jsonText);
		const filters = filterSchema.parse(parsed);

		let data = [];
		switch (filters.entidad) {
			case "factura":
				data = await getFacturas();
				break;
			case "siniestro":
				data = await getSiniestros();
				break;
			case "uti":
				data = await getUTI();
				break;
			case "cirugia":
				data = await getCirugias();
				break;
			default:
				data = [];
		}

		const results = data.filter((item) => {
			if (filters.dni) {
				const itemDni =
					item.dni ||
					item.paciente?.dni ||
					item.pacienteDatos?.dni ||
					"";
				const normalizedItem = String(itemDni).replace(/\D/g, "");
				const normalizedQuery = filters.dni.replace(/\D/g, "");
				if (!normalizedItem.includes(normalizedQuery)) return false;
			}

			if (filters.artSeguro) {
				const itemArt =
					item.artSeguro ||
					item.paciente?.artSeguro ||
					item.artKey ||
					"";
				if (
					!String(itemArt)
						.toLowerCase()
						.includes(filters.artSeguro.toLowerCase())
				) {
					return false;
				}
			}

			if (filters.pacienteNombre) {
				const itemNombre =
					item.paciente ||
					item.nombre ||
					item.paciente?.nombreCompleto ||
					item.pacienteDatos?.nombreCompleto ||
					"";
				if (
					!String(itemNombre)
						.toLowerCase()
						.includes(filters.pacienteNombre.toLowerCase())
				) {
					return false;
				}
			}

			if (filters.estado && item.estado !== filters.estado) return false;
			if (filters.activo !== undefined && item.activo !== filters.activo)
				return false;

			const itemFecha =
				item.fechaAtencion ||
				item.paciente?.fechaAtencion ||
				item.fechaEstimada ||
				null;
			if (
				filters.fechaDesde &&
				itemFecha &&
				itemFecha < filters.fechaDesde
			)
				return false;
			if (
				filters.fechaHasta &&
				itemFecha &&
				itemFecha > filters.fechaHasta
			)
				return false;

			if (
				filters.totalMin &&
				(item.totales?.total || 0) < filters.totalMin
			)
				return false;
			if (
				filters.totalMax &&
				(item.totales?.total || 0) > filters.totalMax
			)
				return false;

			return true;
		});

		if (filters.respuestaEsperada === "conteo") {
			return NextResponse.json({
				filters,
				total: results.length,
				mensaje: `Se encontraron ${results.length} ${filters.entidad}(s) que cumplen los filtros.`,
			});
		}

		return NextResponse.json({
			filters,
			total: results.length,
			results: results.slice(0, 20),
		});
	} catch (error) {
		console.error("[API /filter] Error:", error);

		if (error?.name === "ZodError") {
			return NextResponse.json(
				{
					error: "La IA devolvió un formato inesperado. Probá de nuevo.",
				},
				{ status: 502 },
			);
		}

		return NextResponse.json(
			{ error: error.message || "Error interno del servidor." },
			{ status: 500 },
		);
	}
}
