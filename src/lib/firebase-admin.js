// src/lib/firebase-admin.js
import "server-only";

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

// Evitamos reinicializar en cada hot-reload de Next.js
if (!getApps().length) {
	try {
		initializeApp({
			credential: cert({
				projectId: process.env.FIREBASE_PROJECT_ID,
				clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
				privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
					/\\n/g,
					"\n",
				),
			}),
			databaseURL: process.env.FIREBASE_DATABASE_URL,
		});
		console.log("✅ Firebase Admin inicializado correctamente.");
	} catch (error) {
		console.error("❌ Error al inicializar Firebase Admin:", error.message);
	}
}

/**
 * Lee un nodo completo de Realtime Database y lo devuelve como array.
 * Convierte { clave: valor } en [{ id: clave, ...valor }]
 */
async function readNode(nodeName) {
	try {
		const db = getDatabase();
		const ref = db.ref(nodeName);
		const snapshot = await ref.once("value");

		if (!snapshot.exists()) {
			console.warn(`⚠️ El nodo "${nodeName}" está vacío o no existe.`);
			return [];
		}

		const data = snapshot.val();
		return Object.entries(data).map(([key, value]) => ({
			id: key,
			...value,
		}));
	} catch (error) {
		console.error(`❌ Error al leer el nodo "${nodeName}":`, error.message);
		throw new Error(`No se pudieron obtener los datos de "${nodeName}".`);
	}
}

// ---------------------------------------------------------------------------
// Funciones específicas por entidad de la clínica
// ---------------------------------------------------------------------------

/**
 * Facturas cerradas o en borrador.
 * Cada item tiene: { id, estado, convenio, paciente, practicas, totales }
 */
export async function getFacturas() {
	return readNode("Facturacion");
}

/**
 * Índice de siniestros. Estructura: { "art__nroSiniestro": { dni, id, status } }
 * Lo convertimos a array plano con la clave separada en art + nro.
 */
export async function getSiniestros() {
	const db = getDatabase();
	const snapshot = await db.ref("siniestros").once("value");
	if (!snapshot.exists()) return [];

	const data = snapshot.val();
	return Object.entries(data).map(([key, value]) => {
		// key tiene formato "art__nroSiniestro" (ej: "iaps_art__162398")
		const [artKey, nroSiniestro] = key.split("__");
		return {
			id: key,
			artKey: artKey || "",
			nroSiniestro: nroSiniestro || "",
			...value,
		};
	});
}

/**
 * Internaciones en UTI (activas o dadas de alta).
 * Cada item tiene: { id, activo, paciente, dni, diagnosticoActual, ingresos }
 */
export async function getUTI() {
	return readNode("UTI");
}

/**
 * Cirugías programadas.
 * Cada item tiene: { id, doctor, pacienteDatos, fechaEstimada, realizada }
 */
export async function getCirugias() {
	return readNode("cirugias");
}

/**
 * Convenios con valores generales y honorarios por complejidad.
 * Es un objeto, no una lista. Se devuelve como array de convenios.
 */
export async function getConvenios() {
	const db = getDatabase();
	const snapshot = await db.ref("convenios").once("value");
	if (!snapshot.exists()) return [];

	const data = snapshot.val();
	return Object.entries(data).map(([nombre, valores]) => ({
		id: nombre,
		nombre,
		valores,
	}));
}
