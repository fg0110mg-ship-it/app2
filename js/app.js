// ============================================================
// app.js - Bench140 (versión 100% estática, sin servidor)
// Toda la lógica que antes vivía en Flask/Python ahora corre
// en el navegador. Los datos se guardan en localStorage, así
// que persisten en este dispositivo entre visitas al link.
// ============================================================

const STORAGE_KEY = "bench140_db_v1";
const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DIAS_LABEL = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };

let DB = null;
let mesCalendarioActual = new Date();
let chart1RM = null;
let chartVolumen = null;

// ------------------------------------------------------------
// Utilidades generales
// ------------------------------------------------------------
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function uid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
  return v.toString(16);
}); }
function fechaHoyISO() { return new Date().toISOString().slice(0, 10); }
function diaSemanaDeFecha(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  const idx = (d.getDay() + 6) % 7; // lunes=0
  return DIAS_SEMANA[idx];
}
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function sanearTexto(txt, maxlen = 200) {
  if (txt == null) return "";
  return String(txt).slice(0, maxlen).replace(/<[^>]*>/g, "").trim();
}
function sanearNumero(val, def = 0, min = null, max = null) {
  let n = parseFloat(val);
  if (isNaN(n)) n = def;
  if (min != null) n = Math.max(min, n);
  if (max != null) n = Math.min(max, n);
  return n;
}

// ------------------------------------------------------------
// CÁLCULO DE 1RM
// ------------------------------------------------------------
function epley1RM(peso, reps) {
  if (reps <= 0) return 0;
  if (reps === 1) return Math.round(peso * 10) / 10;
  return Math.round(peso * (1 + reps / 30) * 10) / 10;
}
function brzycki1RM(peso, reps) {
  if (reps <= 0 || reps >= 37) return 0;
  if (reps === 1) return Math.round(peso * 10) / 10;
  return Math.round((peso * 36 / (37 - reps)) * 10) / 10;
}
function estimar1RMPromedio(peso, reps) {
  return Math.round(((epley1RM(peso, reps) + brzycki1RM(peso, reps)) / 2) * 10) / 10;
}

// ------------------------------------------------------------
// CATÁLOGO BASE DE EJERCICIOS (mismo contenido que la versión Flask)
// ------------------------------------------------------------
function catalogoBase() {
  const ex = [
    { nombre: "Press de banca con barra", grupo: "pecho", tipo: "barra", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 1.0, nota: "Ejercicio de referencia para el objetivo de 140kg. Usar con baja frecuencia y técnica controlada." },
    { nombre: "Press de banca en máquina (Smith)", grupo: "pecho", tipo: "maquina", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 0.9, nota: "Permite sobrecargar con menor demanda de estabilización. Mantener trayectoria fija." },
    { nombre: "Press pectoral en máquina (horizontal)", grupo: "pecho", tipo: "maquina", patron: "empuje_horizontal", curva: "constante", factor_1rm: 0.75, nota: "Base de hipertrofia de pecho. Controlar el tempo, 2s excéntrica." },
    { nombre: "Press inclinado en máquina", grupo: "pecho_superior", tipo: "maquina", patron: "empuje_horizontal", curva: "constante", factor_1rm: 0.7, nota: "Énfasis en fibras claviculares, clave para fuerza de empuje en banca." },
    { nombre: "Press declinado en máquina", grupo: "pecho_inferior", tipo: "maquina", patron: "empuje_horizontal", curva: "constante", factor_1rm: 0.65, nota: "Complementa el desarrollo del pectoral inferior." },
    { nombre: "Aperturas en máquina (peck deck)", grupo: "pecho", tipo: "maquina", patron: "accesorio", curva: "creciente", factor_1rm: 0.3, nota: "Trabajo de aislamiento, buscar estiramiento y contracción máxima." },
    { nombre: "Press inclinado con mancuerna", grupo: "pecho_superior", tipo: "mancuerna", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 0.55, nota: "Mayor rango de movimiento, opcional según disponibilidad." },
    { nombre: "Fondos en máquina asistida", grupo: "pecho_triceps", tipo: "maquina", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 0.5, nota: "Reducir asistencia progresivamente para aumentar dificultad." },
    { nombre: "Press en máquina convergente (Hammer Strength)", grupo: "pecho", tipo: "maquina", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 0.85, nota: "Excelente transferencia a banca por su patrón de empuje libre guiado." },
    { nombre: "Press militar en máquina", grupo: "hombro", tipo: "maquina", patron: "empuje_vertical", curva: "decreciente", factor_1rm: 0.4, nota: "Fortalece deltoides anterior, estabilizador clave en el press de banca." },
    { nombre: "Press de hombros con mancuernas", grupo: "hombro", tipo: "mancuerna", patron: "empuje_vertical", curva: "decreciente", factor_1rm: 0.35, nota: "Uso opcional, exige mayor estabilización." },
    { nombre: "Elevaciones laterales con mancuerna", grupo: "hombro", tipo: "mancuerna", patron: "accesorio", curva: "creciente", factor_1rm: 0.1, nota: "Aislamiento de deltoides lateral, mantener técnica estricta." },
    { nombre: "Elevaciones laterales en polea", grupo: "hombro", tipo: "polea", patron: "accesorio", curva: "constante", factor_1rm: 0.1, nota: "Tensión constante en todo el recorrido." },
    { nombre: "Face pull en polea", grupo: "hombro_posterior", tipo: "polea", patron: "traccion_horizontal", curva: "constante", factor_1rm: 0.15, nota: "Esencial para salud de hombro y equilibrio agonista/antagonista." },
    { nombre: "Extensión de tríceps en polea", grupo: "triceps", tipo: "polea", patron: "accesorio", curva: "constante", factor_1rm: 0.25, nota: "Codos fijos, evitar balanceo del torso." },
    { nombre: "Extensión de tríceps en máquina", grupo: "triceps", tipo: "maquina", patron: "accesorio", curva: "constante", factor_1rm: 0.25, nota: "Buena opción de aislamiento controlado." },
    { nombre: "Press francés con barra", grupo: "triceps", tipo: "barra", patron: "accesorio", curva: "creciente", factor_1rm: 0.2, nota: "Opcional, cuidar la articulación del codo." },
    { nombre: "Fondos entre bancos", grupo: "triceps", tipo: "peso_corporal", patron: "empuje_horizontal", curva: "decreciente", factor_1rm: 0.2, nota: "Alternativa sin máquina si está ocupada." },
    { nombre: "Jalón al pecho en polea", grupo: "espalda", tipo: "polea", patron: "traccion_vertical", curva: "constante", factor_1rm: 0.4, nota: "Antagonista directo del press, fundamental para balance articular." },
    { nombre: "Remo en máquina (sentado)", grupo: "espalda", tipo: "maquina", patron: "traccion_horizontal", curva: "constante", factor_1rm: 0.4, nota: "Mejora estabilidad escapular, clave para sostener cargas pesadas en banca." },
    { nombre: "Remo con barra", grupo: "espalda", tipo: "barra", patron: "traccion_horizontal", curva: "decreciente", factor_1rm: 0.35, nota: "Opcional, mantener espalda neutra." },
    { nombre: "Jalón al pecho con agarre cerrado en máquina", grupo: "espalda", tipo: "maquina", patron: "traccion_vertical", curva: "constante", factor_1rm: 0.35, nota: "Variante que enfatiza dorsal medio." },
    { nombre: "Remo gironda en máquina", grupo: "espalda", tipo: "maquina", patron: "traccion_horizontal", curva: "constante", factor_1rm: 0.35, nota: "Buen aislamiento de dorsal ancho." },
    { nombre: "Pull-over en polea", grupo: "espalda_pecho", tipo: "polea", patron: "accesorio", curva: "creciente", factor_1rm: 0.15, nota: "Trabaja dorsal ancho y serrato, complementa el press." },
    { nombre: "Curl de bíceps en máquina", grupo: "biceps", tipo: "maquina", patron: "accesorio", curva: "constante", factor_1rm: 0.1, nota: "Aislamiento estricto, evitar impulso." },
    { nombre: "Curl martillo con mancuerna", grupo: "biceps_antebrazo", tipo: "mancuerna", patron: "accesorio", curva: "constante", factor_1rm: 0.1, nota: "Trabaja braquial y antebrazo, mejora el agarre." },
    { nombre: "Curl de bíceps en polea", grupo: "biceps", tipo: "polea", patron: "accesorio", curva: "constante", factor_1rm: 0.1, nota: "Tensión constante en todo el rango." },
    { nombre: "Prensa de piernas 45°", grupo: "cuadriceps_gluteo", tipo: "maquina", patron: "rodilla", curva: "decreciente", factor_1rm: 0.0, nota: "Base de fuerza de tren inferior, no transfiere directo a banca pero esencial para fuerza global." },
    { nombre: "Sentadilla en máquina Smith", grupo: "cuadriceps_gluteo", tipo: "maquina", patron: "rodilla", curva: "decreciente", factor_1rm: 0.0, nota: "Trayectoria guiada, segura para volumen alto." },
    { nombre: "Extensión de cuádriceps en máquina", grupo: "cuadriceps", tipo: "maquina", patron: "accesorio", curva: "creciente", factor_1rm: 0.0, nota: "Aislamiento de cuádriceps, cuidar la rodilla." },
    { nombre: "Curl femoral en máquina (tumbado/sentado)", grupo: "isquiotibiales", tipo: "maquina", patron: "accesorio", curva: "creciente", factor_1rm: 0.0, nota: "Equilibra el desarrollo de cuádriceps/isquiotibiales." },
    { nombre: "Peso muerto rumano con barra", grupo: "isquiotibiales_gluteo", tipo: "barra", patron: "cadera", curva: "creciente", factor_1rm: 0.0, nota: "Opcional, técnica estricta, fortalece cadena posterior." },
    { nombre: "Hip thrust en máquina/barra", grupo: "gluteo", tipo: "maquina", patron: "cadera", curva: "creciente", factor_1rm: 0.0, nota: "Desarrollo de glúteo, mejora estabilidad pélvica general." },
    { nombre: "Elevación de gemelos en máquina", grupo: "gemelos", tipo: "maquina", patron: "accesorio", curva: "creciente", factor_1rm: 0.0, nota: "Aislamiento de gemelos, rango completo." },
    { nombre: "Plancha abdominal", grupo: "core", tipo: "peso_corporal", patron: "accesorio", curva: "constante", factor_1rm: 0.0, nota: "Estabilidad de core, transfiere a la rigidez necesaria al banco." },
    { nombre: "Crunch en máquina", grupo: "core", tipo: "maquina", patron: "accesorio", curva: "constante", factor_1rm: 0.0, nota: "Aislamiento de recto abdominal." },
  ];
  return ex.map(e => ({ ...e, id: uid(), personalizado: false }));
}

// ------------------------------------------------------------
// PERIODIZACIÓN: bloques y plantilla semanal
// ------------------------------------------------------------
const BLOQUES = [
  { nombre: "Adaptación Anatómica", semanas: 4, series: 3, reps: "12-15", reps_min: 12, reps_max: 15, rpe_objetivo: 6, descanso: "60-75s", descripcion: "Preparar tendones, articulaciones y aprender el patrón técnico de cada máquina." },
  { nombre: "Hipertrofia", semanas: 6, series: 4, reps: "8-12", reps_min: 8, reps_max: 12, rpe_objetivo: 7, descanso: "75-90s", descripcion: "Maximizar volumen efectivo de entrenamiento para ganar masa muscular en pecho, hombro y tríceps." },
  { nombre: "Fuerza Máxima", semanas: 5, series: 5, reps: "3-6", reps_min: 3, reps_max: 6, rpe_objetivo: 8, descanso: "120-180s", descripcion: "Convertir la masa ganada en fuerza máxima aplicable al press de banca con barra." },
  { nombre: "Transición / Descarga", semanas: 1, series: 2, reps: "10-12", reps_min: 10, reps_max: 12, rpe_objetivo: 5, descanso: "60s", descripcion: "Disipar fatiga acumulada antes de reiniciar el ciclo en un nuevo bloque." },
];

const PLANTILLA_SEMANA = {
  lunes: { titulo: "Empuje horizontal + tríceps", patrones: ["empuje_horizontal", "empuje_horizontal", "empuje_horizontal", "empuje_horizontal", "accesorio_triceps", "accesorio_biceps"] },
  martes: { titulo: "Tracción + bíceps", patrones: ["traccion_vertical", "traccion_horizontal", "traccion_horizontal", "accesorio_biceps", "accesorio_biceps"] },
  miercoles: { titulo: "Piernas + hombros", patrones: ["rodilla", "accesorio_isquio", "accesorio_cuadriceps", "empuje_vertical", "accesorio_hombro"] },
  jueves: { titulo: "Empuje vertical + tríceps", patrones: ["empuje_vertical", "empuje_horizontal", "accesorio_triceps", "accesorio_triceps", "accesorio_hombro"] },
  viernes: { titulo: "Espalda + hombro posterior", patrones: ["traccion_vertical", "traccion_horizontal", "traccion_horizontal", "accesorio_hombro_post", "cadera"] },
};

const MAPA_PATRON = {
  empuje_horizontal: { patron: "empuje_horizontal" },
  empuje_vertical: { patron: "empuje_vertical" },
  traccion_vertical: { patron: "traccion_vertical" },
  traccion_horizontal: { patron: "traccion_horizontal" },
  rodilla: { patron: "rodilla" },
  cadera: { patron: "cadera" },
  accesorio_triceps: { patron: "accesorio", grupo_contiene: "triceps" },
  accesorio_biceps: { patron: "accesorio", grupo_contiene: "biceps" },
  accesorio_hombro: { patron: "accesorio", grupo_contiene: "hombro" },
  accesorio_hombro_post: { patron: "traccion_horizontal", grupo_contiene: "hombro_posterior" },
  accesorio_isquio: { patron: "accesorio", grupo_contiene: "isquiotibiales" },
  accesorio_cuadriceps: { patron: "accesorio", grupo_contiene: "cuadriceps" },
};

function elegirEjercicio(catalogo, patronLogico, usados, prefMaquinaPct) {
  const info = MAPA_PATRON[patronLogico];
  let candidatos = catalogo.filter(e => e.patron === info.patron && !usados.has(e.id));
  if (info.grupo_contiene) {
    const filtrados = candidatos.filter(e => e.grupo.includes(info.grupo_contiene));
    if (filtrados.length) candidatos = filtrados;
  }
  if (!candidatos.length) {
    candidatos = catalogo.filter(e => !usados.has(e.id));
    if (!candidatos.length) return null;
  }
  candidatos.sort((a, b) => {
    const sa = (a.tipo === "maquina" || a.tipo === "polea") ? 1 : 0;
    const sb = (b.tipo === "maquina" || b.tipo === "polea") ? 1 : 0;
    return prefMaquinaPct >= 50 ? (sb - sa) : (sa - sb);
  });
  return candidatos[0];
}

function calcularPesoSugerido(ejercicio, rmBancaActual, repsObjetivo) {
  const factor = ejercicio.factor_1rm || 0.3;
  let baseRM;
  if (factor <= 0) baseRM = Math.max(40, rmBancaActual * 0.6);
  else baseRM = rmBancaActual * Math.max(factor, 0.15);
  let pesoTrabajo = baseRM / (1 + repsObjetivo / 30);
  pesoTrabajo = Math.round(pesoTrabajo / 2.5) * 2.5;
  return Math.max(pesoTrabajo, 2.5);
}

function generarRutina(perfil, catalogo, bloqueIdx = 0) {
  const bloque = BLOQUES[bloqueIdx % BLOQUES.length];
  const rmBanca = perfil.rm_banca || 60;
  const prefMaquina = perfil.pref_maquina_pct != null ? perfil.pref_maquina_pct : 70;
  const repsObj = bloque.reps_max;

  const dias = {};
  for (const [dia, info] of Object.entries(PLANTILLA_SEMANA)) {
    const usados = new Set();
    let ejerciciosDia = [];
    for (const patronLogico of info.patrones) {
      const ej = elegirEjercicio(catalogo, patronLogico, usados, prefMaquina);
      if (!ej) continue;
      usados.add(ej.id);
      const peso = calcularPesoSugerido(ej, rmBanca, repsObj);
      ejerciciosDia.push({
        ejercicio_id: ej.id, nombre: ej.nombre, grupo: ej.grupo, tipo: ej.tipo,
        series: bloque.series, reps: bloque.reps, peso_sugerido: peso,
        descanso: bloque.descanso, nota_tecnica: ej.nota, rpe_objetivo: bloque.rpe_objetivo,
      });
    }
    ejerciciosDia = ejerciciosDia.slice(0, 7);
    while (ejerciciosDia.length < 5 && usados.size < catalogo.length) {
      const extra = elegirEjercicio(catalogo, "accesorio_triceps", usados, prefMaquina);
      if (!extra || usados.has(extra.id)) break;
      usados.add(extra.id);
      const peso = calcularPesoSugerido(extra, rmBanca, repsObj);
      ejerciciosDia.push({
        ejercicio_id: extra.id, nombre: extra.nombre, grupo: extra.grupo, tipo: extra.tipo,
        series: bloque.series, reps: bloque.reps, peso_sugerido: peso,
        descanso: bloque.descanso, nota_tecnica: extra.nota, rpe_objetivo: bloque.rpe_objetivo,
      });
    }
    dias[dia] = { titulo: info.titulo, ejercicios: ejerciciosDia };
  }

  return {
    bloque_idx: bloqueIdx % BLOQUES.length, bloque_nombre: bloque.nombre,
    bloque_descripcion: bloque.descripcion, semanas_bloque: bloque.semanas,
    dias, generada_en: new Date().toISOString(),
  };
}

function grupoACategoriaVolumen(grupo) {
  const g = grupo.toLowerCase();
  if (g.includes("pecho")) return "pecho";
  if (g.includes("hombro")) return "hombro";
  if (g.includes("triceps")) return "triceps";
  if (g.includes("biceps")) return "biceps";
  if (g.includes("espalda") || g.includes("dorsal")) return "espalda";
  if (g.includes("cuadriceps") || g.includes("isquio") || g.includes("gluteo") || g.includes("gemelo")) return "piernas";
  if (g.includes("core")) return "core";
  return "otros";
}
const LIMITE_SERIES_SEMANALES = { pecho: 22, hombro: 20, triceps: 18, biceps: 16, espalda: 22, piernas: 24, core: 14, otros: 16 };

function calcularVolumenSemanal(rutina) {
  const volumen = {};
  for (const data of Object.values(rutina.dias || {})) {
    for (const ej of data.ejercicios) {
      const cat = grupoACategoriaVolumen(ej.grupo);
      volumen[cat] = (volumen[cat] || 0) + ej.series;
    }
  }
  return Object.entries(volumen).map(([grupo, series]) => {
    const limite = LIMITE_SERIES_SEMANALES[grupo] || 16;
    return { grupo, series_semanales: series, limite_recomendado: limite, sobreentrenamiento: series > limite };
  });
}

// ------------------------------------------------------------
// PERSISTENCIA (localStorage)
// ------------------------------------------------------------
function estadoInicial() {
  return {
    configurado: false, perfil: {}, catalogo: catalogoBase(),
    rutina: {}, asistencia: {}, sesiones: [], progreso_1rm: [],
    bloque_actual: 0, semana_actual: 1, tema: "oscuro", ultima_fecha_entrenada: null,
  };
}
function cargarDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { const db = estadoInicial(); guardarDB(db); return db; }
  try { return JSON.parse(raw); } catch (e) { const db = estadoInicial(); guardarDB(db); return db; }
}
function guardarDB(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

// ------------------------------------------------------------
// ASISTENCIA / desplazamiento al sábado
// ------------------------------------------------------------
function procesarMarcadoDia(db, fechaStr, diaSemana, estado) {
  db.asistencia[fechaStr] = db.asistencia[fechaStr] || {};
  db.asistencia[fechaStr].dia = diaSemana;
  db.asistencia[fechaStr].estado = estado;
  db.asistencia[fechaStr].actualizado_en = new Date().toISOString();

  if (estado === "no_realizado" && ["lunes", "martes", "miercoles", "jueves", "viernes"].includes(diaSemana)) {
    const fecha = new Date(fechaStr + "T00:00:00");
    const idxLunes = (fecha.getDay() + 6) % 7;
    const deltaASabado = 5 - idxLunes;
    const sabado = new Date(fecha); sabado.setDate(fecha.getDate() + deltaASabado);
    const sabadoStr = sabado.toISOString().slice(0, 10);
    const sabadoInfo = db.asistencia[sabadoStr] || {};
    if (!["ocupado_recuperacion", "realizado"].includes(sabadoInfo.estado)) {
      db.asistencia[sabadoStr] = {
        dia: "sabado", estado: "ocupado_recuperacion", dia_recuperado: diaSemana,
        fecha_origen: fechaStr, actualizado_en: new Date().toISOString(),
      };
      db.asistencia[fechaStr].recuperado_en_sabado = sabadoStr;
    } else {
      db.asistencia[fechaStr].dia_perdido = true;
    }
  }
  return db;
}
function aplicarAjustePorDiasPerdidos(db) {
  return Object.values(db.asistencia).filter(v => v.dia_perdido).length;
}

// ============================================================
// INICIO DE LA APP / RENDER
// ============================================================
function iniciar() {
  DB = cargarDB();
  aplicarTema(DB.tema || "oscuro");

  if (!DB.configurado) mostrarVista("setup");
  else { mostrarVista("app"); refrescarTodo(); }

  configurarEventosSetup();
  configurarEventosApp();
}

function mostrarVista(nombre) {
  $("#vista-setup").classList.toggle("activa", nombre === "setup");
  $("#vista-app").classList.toggle("activa", nombre === "app");
}

function refrescarTodo() {
  renderTopbar();
  renderHoy();
  renderCalendario();
  renderEstadisticas();
  renderCatalogo();
  renderPerfilResumen();
}

// ------------------------------------------------------------
// SETUP
// ------------------------------------------------------------
function configurarEventosSetup() {
  $all(".tab-mini").forEach(btn => {
    btn.addEventListener("click", () => {
      $all(".tab-mini").forEach(b => b.classList.remove("activa"));
      btn.classList.add("activa");
      const modo = btn.dataset.modo;
      $("#modo-directo").classList.toggle("oculto", modo !== "directo");
      $("#modo-test").classList.toggle("oculto", modo !== "test");
    });
  });

  const sliderPref = $('input[name="pref_maquina_pct"]');
  sliderPref.addEventListener("input", () => { $("#pref-valor").textContent = sliderPref.value + "%"; });

  $("#form-setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const modoTest = !$("#modo-test").classList.contains("oculto");

    const perfil = {
      edad: sanearNumero(fd.get("edad"), 25, 10, 90),
      peso_corporal: sanearNumero(fd.get("peso_corporal"), 75, 30, 250),
      altura: sanearNumero(fd.get("altura"), 175, 100, 230),
      rm_banca: sanearNumero(fd.get("rm_banca"), 60, 5, 300),
      rm_estimado_por_test: false,
      dias_disponibles: ["lunes", "martes", "miercoles", "jueves", "viernes"],
      sabado_opcional: true,
      pref_maquina_pct: sanearNumero(fd.get("pref_maquina_pct"), 70, 0, 100),
      lesiones: sanearTexto(fd.get("lesiones"), 500),
      objetivo_rm: 140,
    };

    if (modoTest && fd.get("test_peso") && fd.get("test_reps")) {
      const pesoTest = sanearNumero(fd.get("test_peso"), 40, 5, 300);
      const repsTest = Math.round(sanearNumero(fd.get("test_reps"), 10, 1, 20));
      perfil.rm_banca = estimar1RMPromedio(pesoTest, repsTest);
      perfil.rm_estimado_por_test = true;
    }

    DB.perfil = perfil;
    DB.configurado = true;
    DB.bloque_actual = 0;
    DB.semana_actual = 1;
    DB.rutina = generarRutina(perfil, DB.catalogo, 0);
    DB.progreso_1rm.push({ fecha: fechaHoyISO(), valor: perfil.rm_banca });
    guardarDB(DB);

    mostrarVista("app");
    refrescarTodo();
  });
}

function renderPerfilResumen() {
  const p = DB.perfil;
  $("#perfil-resumen").innerHTML = `
    Edad: ${p.edad} años · Peso: ${p.peso_corporal} kg · Altura: ${p.altura} cm<br>
    1RM banca estimado: <strong>${p.rm_banca} kg</strong> · Preferencia máquinas: ${p.pref_maquina_pct}%<br>
    Lesiones/restricciones: ${p.lesiones ? escapeHTML(p.lesiones) : "Ninguna registrada"}
  `;
}

// ------------------------------------------------------------
// TABS / NAV
// ------------------------------------------------------------
function configurarEventosApp() {
  $all(".tab[data-vista]").forEach(tab => {
    tab.addEventListener("click", () => {
      $all(".tab[data-vista]").forEach(t => t.classList.remove("activa"));
      tab.classList.add("activa");
      $all(".panel").forEach(p => p.classList.remove("activo"));
      $(`#panel-${tab.dataset.vista}`).classList.add("activo");
    });
  });

  $("#btn-tema").addEventListener("click", () => {
    const nuevo = DB.tema === "oscuro" ? "claro" : "oscuro";
    aplicarTema(nuevo);
    DB.tema = nuevo;
    guardarDB(DB);
  });

  $("#btn-marcar-realizado").addEventListener("click", () => marcarDiaHoy("realizado"));
  $("#btn-marcar-no-realizado").addEventListener("click", () => marcarDiaHoy("no_realizado"));
  $("#btn-guardar-sesion").addEventListener("click", guardarSesionHoy);

  $("#cal-prev").addEventListener("click", () => { mesCalendarioActual.setMonth(mesCalendarioActual.getMonth() - 1); renderCalendario(); });
  $("#cal-next").addEventListener("click", () => { mesCalendarioActual.setMonth(mesCalendarioActual.getMonth() + 1); renderCalendario(); });

  $("#btn-test-1rm").addEventListener("click", abrirTest1RM);
  $("#btn-avanzar-bloque").addEventListener("click", avanzarBloque);

  $("#btn-nuevo-ejercicio").addEventListener("click", () => abrirModalEjercicio());
  $("#btn-cerrar-modal").addEventListener("click", () => $("#modal-ejercicio").classList.add("oculto"));
  $("#form-ejercicio").addEventListener("submit", guardarEjercicio);

  $("#btn-cerrar-modal-alt").addEventListener("click", () => $("#modal-alternativas").classList.add("oculto"));

  $("#btn-exportar").addEventListener("click", exportarJSON);
  $("#input-importar").addEventListener("change", importarArchivo);
  $("#btn-reconfigurar").addEventListener("click", () => {
    if (confirm("Esto te llevará de nuevo a la configuración inicial (tus datos guardados no se borran hasta que generes un nuevo plan). ¿Continuar?")) {
      mostrarVista("setup");
    }
  });
}

function aplicarTema(tema) { document.body.dataset.tema = tema; }

function renderTopbar() {
  const rm = DB.perfil.rm_banca || 0;
  $("#rm-actual-top").textContent = rm;
  const pct = Math.min(100, (rm / 140) * 100);
  $("#barra-progreso-fill").style.width = pct + "%";
}

// ------------------------------------------------------------
// VISTA: HOY
// ------------------------------------------------------------
function diaActivoHoy() {
  const fecha = fechaHoyISO();
  const dia = diaSemanaDeFecha(fecha);
  const info = DB.asistencia[fecha];
  if (dia === "sabado" && info && info.dia_recuperado) {
    return { fecha, diaPlantilla: info.dia_recuperado, esRecuperacion: true };
  }
  return { fecha, diaPlantilla: dia, esRecuperacion: false };
}

function renderHoy() {
  const { fecha, diaPlantilla, esRecuperacion } = diaActivoHoy();
  $("#fecha-hoy-label").textContent = new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const bloque = DB.rutina;
  $("#bloque-nombre").textContent = `Bloque: ${bloque.bloque_nombre}`;
  $("#bloque-descripcion").textContent = bloque.bloque_descripcion;

  const diaData = bloque.dias ? bloque.dias[diaPlantilla] : null;
  const cont = $("#lista-ejercicios-hoy");
  cont.innerHTML = "";

  if (!diaData || diaPlantilla === "sabado" || diaPlantilla === "domingo") {
    $("#dia-titulo").textContent = esRecuperacion ? "Día de recuperación" : "Día de descanso";
    cont.innerHTML = `<p class="ayuda">No hay entrenamiento de fuerza planificado hoy. Aprovecha para movilidad o cardio ligero de baja intensidad.</p>`;
    $("#btn-guardar-sesion").classList.add("oculto");
    return;
  }

  $("#btn-guardar-sesion").classList.remove("oculto");
  $("#dia-titulo").textContent = `${DIAS_LABEL[diaPlantilla]}${esRecuperacion ? " (recuperado en sábado)" : ""} — ${diaData.titulo}`;

  diaData.ejercicios.forEach(ej => {
    const div = document.createElement("div");
    div.className = "tarjeta-ejercicio";
    div.dataset.ejercicioId = ej.ejercicio_id;
    div.innerHTML = `
      <div class="cabecera">
        <div>
          <h4>${escapeHTML(ej.nombre)}</h4>
          <span class="tag">${escapeHTML(ej.tipo)}</span>
          <span class="tag">${escapeHTML(ej.grupo)}</span>
        </div>
        <button type="button" class="btn-alt" data-id="${ej.ejercicio_id}">🔁 Alternativa</button>
      </div>
      <p class="nota">${escapeHTML(ej.nota_tecnica)}</p>
      <p class="ayuda">Plan: ${ej.series} series x ${ej.reps} reps · Peso sugerido: <strong>${ej.peso_sugerido} kg</strong> · Descanso: ${ej.descanso} · RPE objetivo: ${ej.rpe_objetivo}</p>
      <div class="fila-inputs">
        <label>Series hechas <input type="number" class="in-series" min="0" max="15" value="${ej.series}"></label>
        <label>Reps hechas <input type="number" class="in-reps" min="0" max="50" value="${parseInt(ej.reps) || 10}"></label>
        <label>Peso usado (kg) <input type="number" class="in-peso" min="0" max="500" step="0.5" value="${ej.peso_sugerido}"></label>
        <label>RPE (1-10) <input type="number" class="in-rpe" min="1" max="10" value="${ej.rpe_objetivo}"></label>
      </div>
      <label class="fallo-check"><input type="checkbox" class="in-fallo"> Hubo fallo muscular / no completé el peso planificado</label>
    `;
    cont.appendChild(div);
  });

  $all(".btn-alt", cont).forEach(btn => btn.addEventListener("click", () => mostrarAlternativas(btn.dataset.id)));
}

function marcarDiaHoy(estado) {
  const { fecha, diaPlantilla } = diaActivoHoy();
  DB = procesarMarcadoDia(DB, fecha, diaPlantilla, estado);
  if (estado === "realizado") DB.ultima_fecha_entrenada = fecha;
  guardarDB(DB);
  refrescarTodo();
  alert(estado === "realizado" ? "Día marcado como realizado." : "Día marcado como no realizado. Se intentó reprogramar al sábado si estaba libre.");
}

function guardarSesionHoy() {
  const { fecha, diaPlantilla } = diaActivoHoy();
  const tarjetas = $all(".tarjeta-ejercicio");
  if (!tarjetas.length) return;

  const diaData = DB.rutina.dias[diaPlantilla];
  const ejerciciosResultado = [];
  const rutinaPorId = {};
  diaData.ejercicios.forEach(e => { rutinaPorId[e.ejercicio_id] = e; });

  tarjetas.forEach(t => {
    const eid = t.dataset.ejercicioId;
    const ref = rutinaPorId[eid];
    const seriesCompletadas = parseFloat($(".in-series", t).value) || 0;
    const seriesObjetivo = ref ? ref.series : seriesCompletadas;
    const repsRealizadas = parseFloat($(".in-reps", t).value) || 0;
    const pesoUsado = parseFloat($(".in-peso", t).value) || 0;
    const rpe = parseFloat($(".in-rpe", t).value) || 7;
    const fallo = $(".in-fallo", t).checked;

    const completoTodo = seriesCompletadas >= seriesObjetivo && seriesObjetivo > 0;
    let siguientePeso, accion;
    if (fallo) {
      siguientePeso = Math.round((pesoUsado * 0.925) / 2.5) * 2.5;
      accion = "reducir_peso_por_fallo";
    } else if (completoTodo && rpe <= 7) {
      const incremento = pesoUsado >= 40 ? 5 : 2.5;
      siguientePeso = pesoUsado + incremento;
      accion = "subir_peso";
    } else {
      siguientePeso = pesoUsado;
      accion = "mantener_peso";
    }
    siguientePeso = Math.max(siguientePeso, 2.5);

    ejerciciosResultado.push({
      ejercicio_id: eid, nombre: ref ? ref.nombre : "",
      series_completadas: seriesCompletadas, series_objetivo: seriesObjetivo,
      reps_realizadas: repsRealizadas, peso_usado: pesoUsado, rpe, fallo,
      siguiente_peso_sugerido: siguientePeso, accion_progresion: accion,
    });

    if (rutinaPorId[eid]) rutinaPorId[eid].peso_sugerido = siguientePeso;
  });

  const duracion = prompt("¿Cuántos minutos duró la sesión?", "60");

  const sesion = {
    id: uid(), fecha, dia: diaPlantilla, duracion_min: sanearNumero(duracion, 0, 0, 600),
    ejercicios: ejerciciosResultado, registrado_en: new Date().toISOString(),
  };
  DB.sesiones.push(sesion);
  DB.ultima_fecha_entrenada = fecha;
  DB = procesarMarcadoDia(DB, fecha, diaPlantilla, "realizado");

  ejerciciosResultado.forEach(item => {
    if (item.nombre.toLowerCase().includes("banca con barra") && item.peso_usado > 0 && item.reps_realizadas > 0) {
      const nuevoRM = estimar1RMPromedio(item.peso_usado, item.reps_realizadas);
      DB.perfil.rm_banca = nuevoRM;
      DB.progreso_1rm.push({ fecha, valor: nuevoRM });
    }
  });

  guardarDB(DB);
  refrescarTodo();
  alert("¡Sesión guardada! Los pesos del próximo entrenamiento se actualizaron según tu desempeño.");
}

function mostrarAlternativas(ejercicioId) {
  const base = DB.catalogo.find(e => e.id === ejercicioId);
  const cont = $("#lista-alternativas");
  if (!base) { cont.innerHTML = `<p class="ayuda">Ejercicio no encontrado.</p>`; }
  else {
    let alternativas = DB.catalogo.filter(e => e.id !== ejercicioId && (e.patron === base.patron || e.grupo === base.grupo));
    alternativas.sort((a, b) => (a.grupo === base.grupo ? 0 : 1) - (b.grupo === base.grupo ? 0 : 1));
    alternativas = alternativas.slice(0, 5);
    cont.innerHTML = alternativas.length
      ? alternativas.map(a => `<div class="alt-item"><strong>${escapeHTML(a.nombre)}</strong><br><span class="ayuda">${escapeHTML(a.grupo)} · ${escapeHTML(a.tipo)} — ${escapeHTML(a.nota)}</span></div>`).join("")
      : `<p class="ayuda">No se encontraron alternativas en el catálogo.</p>`;
  }
  $("#modal-alternativas").classList.remove("oculto");
}

// ------------------------------------------------------------
// VISTA: CALENDARIO
// ------------------------------------------------------------
function renderCalendario() {
  const año = mesCalendarioActual.getFullYear();
  const mes = mesCalendarioActual.getMonth();
  $("#cal-mes-anio").textContent = mesCalendarioActual.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const primerDiaSemana = (new Date(año, mes, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const grid = $("#calendario-grid");
  grid.innerHTML = "";

  ["L", "M", "X", "J", "V", "S", "D"].forEach(d => {
    const cab = document.createElement("div");
    cab.className = "ayuda"; cab.style.textAlign = "center"; cab.textContent = d;
    grid.appendChild(cab);
  });
  for (let i = 0; i < primerDiaSemana; i++) {
    const vacio = document.createElement("div");
    vacio.className = "celda-dia vacia";
    grid.appendChild(vacio);
  }
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaISO = `${año}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const info = DB.asistencia[fechaISO];
    const celda = document.createElement("div");
    celda.className = "celda-dia" + (info ? ` ${info.estado}` : "");
    celda.innerHTML = `<span class="num">${dia}</span>`;
    if (info) celda.title = `${info.dia} - ${info.estado}`;
    grid.appendChild(celda);
  }
}

// ------------------------------------------------------------
// VISTA: ESTADÍSTICAS
// ------------------------------------------------------------
function calcularStats() {
  const sesiones = DB.sesiones;
  const hoy = new Date();
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  inicioSemana.setHours(0, 0, 0, 0);

  const volumenSemana = {};
  let seriesSemana = 0, sesionesSemana = 0;
  sesiones.forEach(s => {
    const fechaS = new Date(s.fecha + "T00:00:00");
    if (fechaS >= inicioSemana) {
      sesionesSemana++;
      s.ejercicios.forEach(ej => {
        const ref = DB.catalogo.find(e => e.id === ej.ejercicio_id);
        const cat = ref ? grupoACategoriaVolumen(ref.grupo) : "otros";
        seriesSemana += ej.series_completadas;
        volumenSemana[cat] = (volumenSemana[cat] || 0) + (ej.series_completadas * ej.peso_usado);
      });
    }
  });

  const records = {};
  sesiones.forEach(s => {
    s.ejercicios.forEach(ej => {
      const nombre = ej.nombre;
      const vol = ej.series_completadas * ej.reps_realizadas * ej.peso_usado;
      if (!records[nombre]) records[nombre] = { peso_max: 0, volumen_max: 0 };
      records[nombre].peso_max = Math.max(records[nombre].peso_max, ej.peso_usado);
      records[nombre].volumen_max = Math.max(records[nombre].volumen_max, vol);
    });
  });

  const diasPlanificados = (DB.perfil.dias_disponibles || []).length || 5;
  const cumplimiento = diasPlanificados ? Math.round((sesionesSemana / diasPlanificados) * 1000) / 10 : 0;

  let alertaInactividad = false, diasSinEntrenar = null;
  if (DB.ultima_fecha_entrenada) {
    const ultima = new Date(DB.ultima_fecha_entrenada + "T00:00:00");
    diasSinEntrenar = Math.round((hoy - ultima) / 86400000);
    alertaInactividad = diasSinEntrenar > 3;
  }

  const volumenGrupoRutina = calcularVolumenSemanal(DB.rutina || {});

  return {
    progreso_1rm: DB.progreso_1rm, records, volumen_semana_kg: volumenSemana,
    series_totales_semana: seriesSemana, sesiones_esta_semana: sesionesSemana,
    cumplimiento_pct: cumplimiento, alerta_inactividad: alertaInactividad,
    dias_sin_entrenar: diasSinEntrenar, volumen_por_grupo_rutina: volumenGrupoRutina,
    objetivo_rm: 140, rm_actual: DB.perfil.rm_banca || 0,
    progreso_objetivo_pct: Math.round(Math.min(100, ((DB.perfil.rm_banca || 0) / 140) * 100) * 10) / 10,
  };
}

function renderEstadisticas() {
  const stats = calcularStats();

  if (stats.alerta_inactividad) {
    $("#alerta-inactividad").classList.remove("oculto");
    $("#alerta-inactividad").textContent = `⚠️ Llevas ${stats.dias_sin_entrenar} días sin entrenar. ¡Retoma tu plan para no perder progreso!`;
  } else {
    $("#alerta-inactividad").classList.add("oculto");
  }

  $("#cards-resumen").innerHTML = `
    <div class="card-stat"><div class="valor">${stats.rm_actual}</div><div class="label">1RM banca actual (kg)</div></div>
    <div class="card-stat"><div class="valor">${stats.progreso_objetivo_pct}%</div><div class="label">Progreso hacia 140 kg</div></div>
    <div class="card-stat"><div class="valor">${stats.sesiones_esta_semana}</div><div class="label">Sesiones esta semana</div></div>
    <div class="card-stat"><div class="valor">${stats.cumplimiento_pct}%</div><div class="label">Cumplimiento semanal</div></div>
    <div class="card-stat"><div class="valor">${stats.series_totales_semana}</div><div class="label">Series totales semana</div></div>
  `;

  const ctx1 = $("#chart-1rm").getContext("2d");
  const labels1 = stats.progreso_1rm.map(p => p.fecha);
  const data1 = stats.progreso_1rm.map(p => p.valor);
  if (chart1RM) chart1RM.destroy();
  chart1RM = new Chart(ctx1, {
    type: "line",
    data: { labels: labels1, datasets: [
      { label: "1RM estimado (kg)", data: data1, borderColor: "#4f8cff", backgroundColor: "rgba(79,140,255,.15)", tension: .3, fill: true },
      { label: "Objetivo (140kg)", data: labels1.map(() => 140), borderColor: "#34c77b", borderDash: [6, 6], pointRadius: 0 },
    ]},
    options: { responsive: true, plugins: { legend: { labels: { color: getColorTexto() } } },
      scales: { x: { ticks: { color: getColorTexto() } }, y: { ticks: { color: getColorTexto() } } } },
  });

  const ctx2 = $("#chart-volumen").getContext("2d");
  const labels2 = stats.volumen_por_grupo_rutina.map(v => v.grupo);
  const data2 = stats.volumen_por_grupo_rutina.map(v => v.series_semanales);
  const colores2 = stats.volumen_por_grupo_rutina.map(v => v.sobreentrenamiento ? "#ef5762" : "#4f8cff");
  if (chartVolumen) chartVolumen.destroy();
  chartVolumen = new Chart(ctx2, {
    type: "bar",
    data: { labels: labels2, datasets: [{ label: "Series semanales planificadas", data: data2, backgroundColor: colores2 }] },
    options: { responsive: true, plugins: { legend: { labels: { color: getColorTexto() } } },
      scales: { x: { ticks: { color: getColorTexto() } }, y: { ticks: { color: getColorTexto() } } } },
  });

  const tbody = $("#tabla-records tbody");
  tbody.innerHTML = "";
  Object.entries(stats.records).forEach(([nombre, r]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHTML(nombre)}</td><td>${r.peso_max}</td><td>${r.volumen_max.toFixed(0)}</td>`;
    tbody.appendChild(tr);
  });
}

function getColorTexto() { return document.body.dataset.tema === "claro" ? "#1c2027" : "#eef0f3"; }

function abrirTest1RM() {
  const peso = prompt("Peso usado en el test (kg):");
  if (!peso) return;
  const reps = prompt("Repeticiones realizadas hasta el fallo (máx. 1 serie):");
  if (!reps) return;
  const rm = estimar1RMPromedio(sanearNumero(peso, 0, 5, 300), Math.round(sanearNumero(reps, 1, 1, 20)));
  DB.perfil.rm_banca = rm;
  DB.progreso_1rm.push({ fecha: fechaHoyISO(), valor: rm });
  guardarDB(DB);
  alert(`Nuevo 1RM estimado: ${rm} kg`);
  refrescarTodo();
}

function avanzarBloque() {
  if (!confirm("Esto avanzará al siguiente bloque de periodización y generará una nueva rutina. ¿Continuar?")) return;
  const perdidos = aplicarAjustePorDiasPerdidos(DB);
  DB.bloque_actual = (DB.bloque_actual + 1) % BLOQUES.length;
  DB.semana_actual = 1;

  const perfilAjustado = { ...DB.perfil };
  if (perdidos > 0) {
    const ajuste = Math.min(0.1, perdidos * 0.02);
    perfilAjustado.rm_banca = Math.round(perfilAjustado.rm_banca * (1 - ajuste) * 10) / 10;
  }
  DB.rutina = generarRutina(perfilAjustado, DB.catalogo, DB.bloque_actual);
  guardarDB(DB);
  if (perdidos > 0) alert(`Se detectaron ${perdidos} día(s) perdido(s) sin recuperar. Se ajustó levemente el volumen/peso del nuevo bloque.`);
  refrescarTodo();
}

// ------------------------------------------------------------
// VISTA: EJERCICIOS (catálogo)
// ------------------------------------------------------------
function renderCatalogo() {
  const cont = $("#lista-catalogo");
  cont.innerHTML = "";
  DB.catalogo.forEach(ej => {
    const div = document.createElement("div");
    div.className = "item-catalogo";
    div.innerHTML = `
      <h4>${escapeHTML(ej.nombre)} ${ej.personalizado ? "⭐" : ""}</h4>
      <span class="tag">${escapeHTML(ej.grupo)}</span>
      <span class="tag">${escapeHTML(ej.tipo)}</span>
      <span class="tag">${escapeHTML(ej.patron)}</span>
      <p class="ayuda">${escapeHTML(ej.nota)}</p>
      <div class="acciones">
        <button type="button" class="btn-secundario btn-editar" data-id="${ej.id}">Editar</button>
        <button type="button" class="btn-secundario btn-eliminar" data-id="${ej.id}">Eliminar</button>
      </div>
    `;
    cont.appendChild(div);
  });

  $all(".btn-editar", cont).forEach(b => b.addEventListener("click", () => {
    abrirModalEjercicio(DB.catalogo.find(e => e.id === b.dataset.id));
  }));
  $all(".btn-eliminar", cont).forEach(b => b.addEventListener("click", () => {
    if (!confirm("¿Eliminar este ejercicio del catálogo?")) return;
    DB.catalogo = DB.catalogo.filter(e => e.id !== b.dataset.id);
    guardarDB(DB);
    refrescarTodo();
  }));
}

function abrirModalEjercicio(ej = null) {
  const form = $("#form-ejercicio");
  form.reset();
  $("#modal-ejercicio-titulo").textContent = ej ? "Editar ejercicio" : "Nuevo ejercicio";
  form.id.value = ej ? ej.id : "";
  if (ej) {
    form.nombre.value = ej.nombre; form.grupo.value = ej.grupo; form.tipo.value = ej.tipo;
    form.patron.value = ej.patron; form.curva.value = ej.curva;
    form.factor_1rm.value = ej.factor_1rm; form.nota.value = ej.nota;
  }
  $("#modal-ejercicio").classList.remove("oculto");
}

function guardarEjercicio(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  const datos = {
    nombre: sanearTexto(fd.get("nombre"), 100), grupo: sanearTexto(fd.get("grupo"), 50),
    tipo: sanearTexto(fd.get("tipo"), 30) || "maquina", patron: sanearTexto(fd.get("patron"), 30) || "accesorio",
    curva: sanearTexto(fd.get("curva"), 20) || "constante",
    factor_1rm: sanearNumero(fd.get("factor_1rm"), 0.2, 0, 1.5), nota: sanearTexto(fd.get("nota"), 300),
  };
  if (!datos.nombre) { alert("El nombre es obligatorio"); return; }

  if (id) {
    const ej = DB.catalogo.find(e2 => e2.id === id);
    if (ej) Object.assign(ej, datos);
  } else {
    DB.catalogo.push({ ...datos, id: uid(), personalizado: true });
  }
  guardarDB(DB);
  $("#modal-ejercicio").classList.add("oculto");
  refrescarTodo();
}

// ------------------------------------------------------------
// AJUSTES: exportar / importar
// ------------------------------------------------------------
function exportarJSON() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "bench140_backup.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importarArchivo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const contenido = JSON.parse(reader.result);
      const requeridos = ["perfil", "catalogo", "rutina", "asistencia", "sesiones", "progreso_1rm"];
      if (!requeridos.every(k => k in contenido)) throw new Error("el archivo no tiene la estructura esperada");
      DB = contenido;
      guardarDB(DB);
      alert("Datos importados correctamente.");
      mostrarVista(DB.configurado ? "app" : "setup");
      if (DB.configurado) refrescarTodo();
    } catch (err) {
      alert("Error al importar: " + err.message);
    }
  };
  reader.readAsText(archivo);
  e.target.value = "";
}

// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", iniciar);
