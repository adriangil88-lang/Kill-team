/* tutorial.js — tutorial inicial paso a paso y ayuda contextual según la fase de la partida. */
const STEPS = [
  { t: 'Bienvenido a Kill Team', i: '⚔', h: `<p>Cada jugador dirige una <b>banda</b> de operativos en un tablero pequeño con terreno. Gana quien tenga más <b>puntos de victoria (PV)</b> tras 4 puntos de giro.</p><p>Los PV se consiguen controlando <b>marcadores</b> (anillos en el suelo), cumpliendo la <b>operación táctica</b> y eliminando enemigos.</p>` },
  { t: 'Un punto de giro', i: '⏱', h: `<p>Cada punto de giro (TP) los jugadores se <b>activan por turnos alternos</b>, un operativo cada vez, hasta que todos han actuado.</p><p>Al activarse eliges su <b>orden</b>: <b>Trabarse</b> (más agresivo, para atacar y avanzar) u <b>Ocultarse</b> (para esconderse y vigilar). Una orden de Ocultarse a cubierto te hace difícil de disparar.</p>` },
  { t: 'Puntos de acción (PA)', i: '◆', h: `<p>Un operativo activado tiene PA (normalmente 2). Cada acción cuesta 1 PA:</p><ul><li><b>Reposicionarse / Correr / Cargar</b>: moverse (toca una casilla verde).</li><li><b>Disparar</b>: elige un blanco visible (marcado en rojo).</li><li><b>Combatir</b>: ataca a un enemigo a ≤1" (zona de control).</li><li><b>Retirarse</b>: salir de un combate.</li><li><b>Misión / Recoger</b>: acciones de objetivo.</li></ul><p>Los botones de la pestaña <b>Acción</b> muestran solo lo que puedes hacer ahora.</p>` },
  { t: 'Dados, cobertura y daño', i: '🎲', h: `<p>Al disparar tiras tantos dados como ataques; <b>un éxito</b> iguala o supera la habilidad del arma, <b>un 6 es crítico</b>. El defensor tira su salvación: la <b>cobertura</b> (terreno cerca del blanco) da una salvación gratis, y el terreno pesado entre ambos <b>ofusca</b> el disparo.</p><p>En combate ambos tiran a la vez y se alternan golpeando o bloqueando. Verás cada tirada en tarjetas sobre el tablero y en el <b>Registro</b>.</p>` },
  { t: 'Ardides y puntos de mando', i: '★', h: `<p>Cada jugador tiene <b>puntos de mando (PC)</b> para usar <b>ardides</b>: repetir dados, mejorar defensa, moverse extra… El juego los ofrece en el momento adecuado (cuando te disparan, al empezar el punto de giro…).</p><p>Con <b>Ardides de tiroteo: automáticos</b> (menú ☰) la IA decide por ti los de defensa; pásalo a manual para controlarlos tú.</p>` },
  { t: 'Controles', i: '🖱', h: `<ul><li><b>Toca/clic</b> en una miniatura para seleccionarla y ver su carta.</li><li><b>3D</b>: arrastra para girar, rueda o pellizco para zoom, doble toque para centrar, Ctrl+arrastrar o WASD para desplazar.</li><li><b>Vista 2D/3D</b> en la barra superior.</li><li>Toca la <b>barra de estado</b> (arriba del tablero) para ver ayuda sobre lo que toca ahora.</li><li>El botón 🔊 activa o silencia el sonido; <b>?</b> abre las reglas y este tutorial.</li></ul>` },
];
export function tutorialHTML(n) {
  const s = STEPS[n];
  return `<div class="tut"><div class="tut-i" aria-hidden="true">${s.i}</div><h2>${s.t}</h2><div class="tut-b">${s.h}</div>
  <div class="tut-dots">${STEPS.map((_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</div>
  <div class="acts"><button class="btn ghost" data-tut="skip">Saltar</button>${n > 0 ? '<button class="btn ghost" data-tut="prev">Anterior</button>' : ''}<button class="btn" data-tut="next">${n === STEPS.length - 1 ? 'Empezar' : 'Siguiente'}</button></div></div>`;
}
export const TUT_N = STEPS.length;

export function ctxHelp(G) {
  const s = G.s; if (!s) return '';
  if (s.over) return '<h2>Partida terminada</h2><p>Revisa el <b>Registro</b> para ver cómo se repartieron los PV. Puedes volver al menú desde ☰.</p>';
  if (s.pend) return '<h2>Decisión pendiente</h2><p>El juego espera una elección tuya (ardid, habilidad, marca u objetivo). Los botones aparecen en la pestaña <b>Acción</b>; cada uno explica su efecto.</p>';
  if (!s.act) return '<h2>Activa un operativo</h2><p>Toca una de tus miniaturas <b>listas</b> (las apagadas ya actuaron) o su botón en la lista de la pestaña <b>Acción</b>. Después elige su orden: <b>Trabarse</b> para atacar y avanzar, <b>Ocultarse</b> para esconderte tras cobertura.</p><p>Si dudas, el equipo rival actúa tras ti: los operativos heridos y los que controlan marcadores suelen ser prioridad.</p>';
  const m = G.ui && G.ui.mode;
  if (m === 'shoot') return '<h2>Disparar</h2><p>Toca el blanco marcado en rojo. El número «≈» es una estimación del daño esperado. Un blanco <b>Oculto y a cubierto</b> no se puede disparar. A ≤2" el atacante ignora la cobertura del blanco.</p>';
  if (m === 'fight') return '<h2>Combatir</h2><p>Elige un enemigo en tu zona de control (≤1"). Se tiran los dados a la vez; cada agente aliado asistente mejora tu Impactar. Después se alternan golpes y paradas.</p>';
  if (m) return '<h2>Mover</h2><p>Las casillas verdes son el alcance. Toca una para ver el camino y toca otra vez (o confirma) para mover. Cargar añade +2" pero termina en combate; Retirarse cuesta más PA si estás trabado.</p>';
  return '<h2>Elige una acción</h2><p>Con los PA que te quedan puedes <b>moverte</b>, <b>disparar</b>, <b>combatir</b> o hacer una acción de misión. Termina con <b>Terminar activación</b> cuando no quieras gastar más PA (los PA sobrantes se pierden).</p>';
}
