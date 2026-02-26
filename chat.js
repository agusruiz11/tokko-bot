/**
 * chat.js — Probá el bot en la terminal sin necesitar WhatsApp.
 * Uso: node chat.js
 *
 * Compatible con Windows Terminal, CMD, PowerShell y Git Bash.
 */
require('dotenv').config();
const readline = require('readline');
const { processMessage } = require('./src/services/aiService');

// Redirigir logs internos a stderr para que no interfieran con el chat
// (se siguen viendo en la terminal pero no rompen el display de readline)
const _log = console.log.bind(console);
console.log = (...args) => {
  const msg = args.join(' ');
  const esInterno = ['[AI]', '[Tokko]', '[Flow]', '[Server]', '[WhatsApp]', '[Instagram]']
    .some(prefix => msg.startsWith(prefix));
  if (esInterno) {
    process.stderr.write(msg + '\n');
  } else {
    _log(...args);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let historial  = [];
let procesando = false;

function escribir(texto) {
  process.stdout.write(texto);
}

function header() {
  escribir('─'.repeat(52) + '\n');
  escribir('  Bot — Miguel Dodórico Propiedades\n');
  escribir('  Escribí "salir" para terminar\n');
  escribir('─'.repeat(52) + '\n\n');
}

function pedirInput() {
  rl.question('Vos: ', manejarInput);
}

async function manejarInput(input) {
  const texto = input.trim();

  if (!texto) {
    return pedirInput();
  }

  if (texto.toLowerCase() === 'salir') {
    escribir('\n¡Hasta luego!\n');
    rl.close();
    return;
  }

  if (procesando) {
    escribir('(esperá que termine de responder...)\n');
    return pedirInput();
  }

  procesando = true;

  try {
    const result = await processMessage(texto, historial); // Llama directo a la IA (sin HTTP)
    historial = result.updatedHistorial;

    // Separador visual + respuesta del bot
    escribir('\nBot: ');
    escribir(result.text);
    escribir('\n');

    if (result.propiedades.length > 0) {
      escribir(`\n  [Tokko devolvió ${result.propiedades.length} propiedad${result.propiedades.length > 1 ? 'es' : ''}]\n`);
      result.propiedades.forEach((p, i) => {
        const precio = p.precio ? `${p.moneda} ${p.precio.toLocaleString('es-AR')}` : 'precio no disponible';
        escribir(`  ${i + 1}. ${p.titulo} — ${precio} — ${p.zona}\n`);
      });
    }

    escribir('\n');
  } catch (e) {
    escribir(`\nError: ${e.message}\n\n`);
  }

  procesando = false;
  pedirInput();
}

header();
pedirInput();
