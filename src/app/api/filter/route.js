// src/app/api/filter/route.js
import { NextResponse } from "next/server";
import { z } from "zod";
import { ENTITY_SCHEMA, ENTITY_KEYS } from "@/lib/entity-schema";
import { getEntityData } from "@/lib/firebase-admin";

const filterSchema = z.object({
	entidad: z.enum(ENTITY_KEYS),
	dni: z.string().optional(),
	nombre: z.string().optional(),
	art: z.string().optional(),
	estado: z.string().optional(),
	activo: z.boolean().optional(),
	realizada: z.boolean().optional(),
	especialidad: z.string().optional(),
	matricula: z.string().optional(),
	texto: z.string().optional(),
	fechaDesde: z.string().optional(),
	fechaHasta: z.string().optional(),
	totalMin: z.number().optional(),
	totalMax: z.number().optional(),
	orden: z.enum(["reciente", "antiguo"]).optional(),
	limite: z.number().int().min(1).max(100).optional(),
	respuestaEsperada: z.enum(["lista", "conteo", "detalle"]),
});

const googleResponseSchema = {
	type: "OBJECT",
	properties: {
		entidad: { type: "STRING", enum: ENTITY_KEYS },
		dni: {
			type: "STRING",
			description: "Solo dígitos, sin puntos ni guiones.",
		},
		nombre: {
			type: "STRING",
			description: "Nombre o apellido de persona.",
		},
		art: { type: "STRING", description: "Obra social / ART." },
		estado: { type: "STRING", description: "Estado del registro." },
		activo: { type: "BOOLEAN" },
		realizada: { type: "BOOLEAN", description: "Solo cirugía." },
		especialidad: { type: "STRING", description: "Solo médicos." },
		matricula: { type: "STRING", description: "Solo médicos." },
		texto: {
			type: "STRING",
			description: "Búsqueda libre en notas/textos.",
		},
		fechaDesde: { type: "STRING", description: "ISO 8601." },
		fechaHasta: { type: "STRING", description: "ISO 8601." },
		totalMin: { type: "NUMBER" },
		totalMax: { type: "NUMBER" },
		orden: {
			type: "STRING",
			enum: ["reciente", "antiguo"],
			description:
				"reciente = más nuevo primero, antiguo = más viejo primero.",
		},
		limite: {
			type: "NUMBER",
			description:
				"Cuántos resultados devolver. 'el último/la última' = 1.",
		},
		respuestaEsperada: {
			type: "STRING",
			enum: ["lista", "conteo", "detalle"],
		},
	},
	required: ["entidad", "respuestaEsperada"],
};

const normalizeDigits = (s = "") => String(s).replace(/\D/g, "");

function getByPath(obj, path) {
	return path
		.split(".")
		.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function matchesText(item, paths, query) {
	if (!paths) return false;
	return paths.some((p) => {
		const v = getByPath(item, p);
		if (v === undefined || v === null) return false;
		return String(v).toLowerCase().includes(query.toLowerCase());
	});
}

// Arma nombre/dni/campos-extra a partir del schema, sin asumir nombres de
// campo específicos por entidad — el front-end no necesita conocer la
// estructura interna de cada nodo de Firebase.
function buildDisplay(item, entity) {
	const nombre =
		(entity.paths.nombre || [])
			.map((p) => getByPath(item, p))
			.filter(Boolean)
			.join(" ") || null;

	const dni = entity.paths.dni
		? (getByPath(item, entity.paths.dni[0]) ?? null)
		: null;

	const extraKeys = [
		"art",
		"estado",
		"especialidad",
		"matricula",
		"fecha",
		"total",
		"activo",
		"realizada",
	];
	const extra = [];
	for (const key of extraKeys) {
		if (!entity.paths[key]) continue;
		const val = entity.paths[key]
			.map((p) => getByPath(item, p))
			.find((v) => v !== undefined && v !== null && v !== "");
		if (val === undefined || val === null || val === "") continue;
		extra.push({ label: key, value: val });
	}

	return { nombre, dni, extra };
}

const MODELS = [
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-3.1-flash-lite",
];

async function callGoogleWithFallback({ apiKey, prompt, responseSchema }) {
	const MAX_RETRIES = 2;
	let lastError = null;

	for (const model of MODELS) {
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
				const res = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [{ parts: [{ text: prompt }] }],
						generationConfig: {
							responseMimeType: "application/json",
							responseSchema,
						},
					}),
				});

				if (res.status === 503 || res.status === 429) {
					lastError = new Error(
						`${model} no disponible (${res.status})`,
					);
					await new Promise((r) => setTimeout(r, 1000 * attempt));
					continue;
				}
				if (res.status === 404) {
					lastError = new Error(`${model} no encontrado`);
					break;
				}
				if (!res.ok)
					throw new Error(
						`Google API ${res.status}: ${await res.text()}`,
					);
				return await res.json();
			} catch (err) {
				lastError = err;
				if (attempt < MAX_RETRIES)
					await new Promise((r) => setTimeout(r, 1000 * attempt));
			}
		}
	}
	throw new Error(`Todos los modelos fallaron. ${lastError?.message || ""}`);
}

export async function POST(request) {
	try {
		const { message, historial } = await request.json();
		// historial: array de los últimos `filters` ya resueltos en la
		// conversación (los manda el front-end), para permitir preguntas
		// de seguimiento tipo "¿y de esos, cuántos están cerrados?".

		if (!message || typeof message !== "string" || !message.trim()) {
			return NextResponse.json(
				{ error: 'El campo "message" es requerido.' },
				{ status: 400 },
			);
		}

		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Falta GOOGLE_GENERATIVE_AI_API_KEY." },
				{ status: 500 },
			);
		}

		const hoy = new Date().toISOString().slice(0, 10);
		const entidadesDescripcion = ENTITY_KEYS.map(
			(k) => `- "${k}": ${ENTITY_SCHEMA[k].description}`,
		).join("\n");

		const contextoPrevio =
			Array.isArray(historial) && historial.length > 0
				? `\nÚltimos filtros aplicados en esta conversación (el más reciente al final):\n${historial
						.slice(-3)
						.map((f, i) => `${i + 1}. ${JSON.stringify(f)}`)
						.join(
							"\n",
						)}\n\nSi la pregunta actual es una continuación ("y de esos...", "ahora filtrá por...", "y los que están cerrados"), partí del último filtro y modificá solo lo que cambie. Si es una pregunta nueva sin relación, ignorá el historial.\n`
				: "";

		const prompt = `Sos el asistente de búsqueda interno de una clínica médica. Traducí la pregunta a filtros estructurados.
Hoy es ${hoy}.

Entidades disponibles (usá SOLO estas):
${entidadesDescripcion}
${contextoPrevio}
Reglas:
- Si preguntan por el total de pacientes en general, usá entidad="historiaClinica".
- DNI: solo dígitos, sin puntos ni guiones.
- "cuántos" → respuestaEsperada="conteo". "buscá/mostrame" → "lista". "contame sobre/detalle de" → "detalle".
- "el último/la última ingresado/a", "el más reciente" → orden="reciente", limite=1.
- "el primero/más antiguo" → orden="antiguo", limite=1.
- "los últimos N" → orden="reciente", limite=N.
- Si no se menciona orden, no lo incluyas (se asume reciente por defecto).

Pregunta del usuario:
"${message.trim()}"`;

		const googleData = await callGoogleWithFallback({
			apiKey,
			prompt,
			responseSchema: googleResponseSchema,
		});
		const jsonText = googleData.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!jsonText)
			throw new Error("La IA no devolvió una respuesta válida.");

		const filters = filterSchema.parse(JSON.parse(jsonText));
		const entity = ENTITY_SCHEMA[filters.entidad];
		const data = await getEntityData(filters.entidad);

		let results = data.filter((item) => {
			if (filters.dni && entity.paths.dni) {
				const itemDni = normalizeDigits(
					getByPath(item, entity.paths.dni[0]) || "",
				);
				if (!itemDni.includes(normalizeDigits(filters.dni)))
					return false;
			}
			if (filters.nombre && entity.paths.nombre) {
				if (!matchesText(item, entity.paths.nombre, filters.nombre))
					return false;
			}
			if (filters.art && entity.paths.art) {
				if (!matchesText(item, entity.paths.art, filters.art))
					return false;
			}
			if (filters.estado && entity.paths.estado) {
				if (getByPath(item, entity.paths.estado[0]) !== filters.estado)
					return false;
			}
			if (filters.activo !== undefined && entity.paths.activo) {
				if (getByPath(item, entity.paths.activo[0]) !== filters.activo)
					return false;
			}
			if (filters.realizada !== undefined && entity.paths.realizada) {
				if (
					getByPath(item, entity.paths.realizada[0]) !==
					filters.realizada
				)
					return false;
			}
			if (filters.especialidad && entity.paths.especialidad) {
				if (
					!matchesText(
						item,
						entity.paths.especialidad,
						filters.especialidad,
					)
				)
					return false;
			}
			if (filters.matricula && entity.paths.matricula) {
				const v = getByPath(item, entity.paths.matricula[0]) || "";
				if (
					!String(v)
						.toLowerCase()
						.includes(filters.matricula.toLowerCase())
				)
					return false;
			}
			if (filters.texto && entity.paths.texto) {
				if (!matchesText(item, entity.paths.texto, filters.texto))
					return false;
			}
			if (
				(filters.fechaDesde || filters.fechaHasta) &&
				entity.paths.fecha
			) {
				const itemFecha = entity.paths.fecha
					.map((p) => getByPath(item, p))
					.find(Boolean);
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
			}
			if ((filters.totalMin || filters.totalMax) && entity.paths.total) {
				const itemTotal = getByPath(item, entity.paths.total[0]) || 0;
				if (filters.totalMin && itemTotal < filters.totalMin)
					return false;
				if (filters.totalMax && itemTotal > filters.totalMax)
					return false;
			}
			return true;
		});

		// Los push IDs de Firebase son ordenables cronológicamente como string,
		// así que sirven para "último/primero ingresado" sin timestamp extra.
		const orden = filters.orden || "reciente";
		results = results.sort((a, b) =>
			orden === "reciente"
				? a.id < b.id
					? 1
					: -1
				: a.id < b.id
					? -1
					: 1,
		);

		const total = results.length;

		if (filters.respuestaEsperada === "conteo") {
			return NextResponse.json({
				filters,
				total,
				mensaje: `Se encontraron ${total} ${entity.label.toLowerCase()} que cumplen los filtros.`,
			});
		}

		const limite = filters.limite || 20;
		const limitados = results.slice(0, limite).map((item) => ({
			...item,
			_display: buildDisplay(item, entity),
		}));

		return NextResponse.json({ filters, total, results: limitados });
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
