// src/lib/entity-schema.js — SIN CAMBIOS respecto a la versión anterior
export const EXCLUDED_NODES = [
	"ART-MAILS",
	"UTI",
	"auditoria_movimientos",
	"counters",
	"facturacionOS",
	"ingresos_farmacia",
	"laboratorios",
	"users",
	"solicitudes-cirugia",
];

export const ENTITY_SCHEMA = {
	factura: {
		path: "Facturacion",
		label: "Facturas",
		description:
			"Facturas médicas. Campos: paciente.artSeguro, paciente.dni, paciente.nombreCompleto, estado (borrador|cerrado), totales.total, paciente.fechaAtencion.",
		paths: {
			dni: ["paciente.dni"],
			nombre: ["paciente.nombreCompleto"],
			art: ["paciente.artSeguro"],
			estado: ["estado"],
			fecha: ["paciente.fechaAtencion"],
			total: ["totales.total"],
		},
	},
	siniestro: {
		path: "pacientes",
		label: "Siniestros ART",
		description:
			"Casos de ART. Campos: trabajador.dni, trabajador.nombre/apellido, ART.nombre, ART.nroSiniestro, estado, fechaDenuncia, empleador.nombre.",
		paths: {
			dni: ["trabajador.dni"],
			nombre: ["trabajador.nombre", "trabajador.apellido"],
			art: ["ART.nombre"],
			estado: ["estado"],
			fecha: ["fechaDenuncia.iso", "fechaIngreso.iso"],
		},
	},
	cirugia: {
		path: "cirugias",
		label: "Cirugías",
		description:
			"Cirugías programadas. Campos: doctor, pacienteDatos.dni/nombre/apellido, fechaEstimada, realizada (true/false).",
		paths: {
			dni: ["pacienteDatos.dni"],
			nombre: [
				"pacienteDatos.nombre",
				"pacienteDatos.apellido",
				"doctor",
			],
			fecha: ["fechaEstimada"],
			realizada: ["realizada"],
		},
	},
	medico: {
		path: "medicos",
		label: "Médicos",
		description:
			"Staff médico. Campos: nombre, apellido, especialidad, matricula, telefono, atencion (array, ej. ART).",
		paths: {
			nombre: ["nombre", "apellido"],
			especialidad: ["especialidad"],
			matricula: ["matricula"],
			texto: ["notas", "atencion"],
		},
	},
	convenio: {
		path: "convenios",
		label: "Convenios",
		description:
			"Convenios de ART con valores_generales y honorarios_medicos por complejidad.",
		paths: { nombre: ["nombre"] },
		idIsNombre: true,
	},
	historiaClinica: {
		path: "historias-clinicas",
		label: "Historias clínicas",
		description:
			"Índice general de pacientes. Campos: dni, historia_clinica, nombre_apellido.",
		paths: { dni: ["dni"], nombre: ["nombre_apellido"] },
	},
	listaPrecio: {
		path: "listas_precios",
		label: "Listas de precios",
		description:
			"Listas de precios por convenio. Campos: nombre, multiplicador, activo.",
		paths: { nombre: ["nombre"], activo: ["activo"] },
	},
	snippet: {
		path: "snippets",
		label: "Textos predefinidos",
		description:
			"Plantillas de texto para solicitudes médicas. Campos: nombre, texto.",
		paths: { nombre: ["nombre"], texto: ["texto"] },
	},
	reparto: {
		path: "repartos_farmacia",
		label: "Repartos de farmacia",
		description:
			"Entregas de insumos a pisos. Campos: destino, responsable, fecha, productos.",
		paths: { nombre: ["destino", "responsable"], fecha: ["fecha"] },
	},
	movimiento: {
		path: "movimientos",
		label: "Movimientos de stock",
		description:
			"Ajustes de stock de farmacia. Campos: usuario, detalle, fecha, tipo, productos.",
		paths: { nombre: ["usuario", "detalle"], fecha: ["fecha"] },
	},
};

export const ENTITY_KEYS = Object.keys(ENTITY_SCHEMA);
