// src/lib/firebase-admin.js
import "server-only";

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { ENTITY_SCHEMA, EXCLUDED_NODES } from "./entity-schema";

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
	} catch (error) {
		console.error("❌ Error al inicializar Firebase Admin:", error.message);
	}
}

/**
 * Lee cualquier nodo/subnodo como array [{ id, ...valor }].
 * Bloquea explícitamente cualquier nodo de EXCLUDED_NODES, aunque alguien
 * lo pida a mano — capa de seguridad además del filtro por entidad conocida.
 */
async function readNode(dbPath) {
	const rootNode = dbPath.split("/")[0];
	if (EXCLUDED_NODES.includes(rootNode)) {
		throw new Error(
			`El nodo "${rootNode}" no está habilitado para consulta.`,
		);
	}

	const db = getDatabase();
	const snapshot = await db.ref(dbPath).once("value");
	if (!snapshot.exists()) return [];

	const data = snapshot.val();
	return Object.entries(data).map(([key, value]) => ({ id: key, ...value }));
}

/** Único punto de entrada: trae los datos de una "entidad" del esquema. */
export async function getEntityData(entityKey) {
	const entity = ENTITY_SCHEMA[entityKey];
	if (!entity) throw new Error(`Entidad "${entityKey}" no reconocida.`);
	return readNode(entity.path);
}
