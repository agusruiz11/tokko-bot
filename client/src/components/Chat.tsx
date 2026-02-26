import { useState, useEffect, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Badge }  from '@/components/ui/badge'
import { PropertyCard, type Property } from '@/components/PropertyCard'

// ── Markdown básico (seguro: primero escapa HTML, luego aplica formato) ────────
function renderMarkdown(raw: string): string {
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#FF6700] font-semibold hover:underline">$1</a>'
    )
    .replace(/^---$/gm, '<hr class="border-gray-200 my-2">')
    .replace(/\n/g, '<br>')
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Message {
  role:        'user' | 'bot'
  text?:       string
  properties?: Property[]
}

// ID de sesión único por pestaña
const userId = 'demo_' + Math.random().toString(36).slice(2, 9)

// ── Componente principal ──────────────────────────────────────────────────────
export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const scrollDown = () =>
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  useEffect(() => { scrollDown() }, [messages, loading])

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, message: text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { role: 'bot', text: data.respuesta, properties: data.propiedades ?? [] },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'bot', text: 'Disculpá, tuve un problema técnico. ¿Podés repetir tu consulta?' },
      ])
    }

    setLoading(false)
    inputRef.current?.focus()
  }, [loading])

  // ── Bienvenida automática ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    fetch('/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, message: 'hola' }),
    })
      .then(r => r.json())
      .then(data => {
        setMessages([{ role: 'bot', text: data.respuesta }])
        setLoading(false)
        inputRef.current?.focus()
      })
      .catch(() => {
        setMessages([{ role: 'bot', text: '¡Hola! Bienvenido a Miguel Dodórico Propiedades. ¿En qué te puedo ayudar?' }])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    // Fondo con gradiente sutil — contiene el modal centrado
    <div className="flex h-[100dvh] items-center justify-center bg-gradient-to-br from-[#003BD3]/10 via-white to-[#FF6700]/10 p-0 sm:p-6 lg:p-10">

      {/* Modal / tarjeta del chat */}
      <div className="flex flex-col w-full h-full sm:w-[480px] sm:h-[700px] sm:rounded-2xl sm:shadow-2xl overflow-hidden bg-white sm:border sm:border-gray-100">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-[#003BD3] px-4 py-3 flex items-center gap-3 shrink-0 shadow-md">
          <img
            src="/assets/logoMD.png"
            alt="Miguel Dodórico"
            className="w-14 h-14 object-contain shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-[15px] leading-tight truncate">
              Miguel Dodórico Propiedades
            </h1>
            <p className="text-white/65 text-[12px] mt-0.5">
              Asistente virtual disponible 24hs
            </p>
          </div>
          <Badge
            variant="success"
            className="text-[11px] px-2 py-0.5 gap-1 shrink-0"
          >
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            En línea
          </Badge>
        </div>

        {/* ── Mensajes ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-[#f0f2f5] scroll-smooth">

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 max-w-[80%] ${
                msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
              }`}
            >
              {/* Burbuja de texto */}
              {msg.text && (
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed word-break-words ${
                    msg.role === 'user'
                      ? 'bg-[#003BD3] text-white rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                  }`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                />
              )}

              {/* Cards de propiedades */}
              {msg.role === 'bot' && msg.properties && msg.properties.length > 0 && (
                <div className="flex flex-col gap-2">
                  {msg.properties.map((p, j) => (
                    <PropertyCard key={j} property={p} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="self-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex gap-1.5 items-center">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-gray-300 rounded-full typing-dot"
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ───────────────────────────────────────────────────────── */}
        <div className="bg-white px-3 py-3 flex gap-2 items-center border-t border-gray-100 shrink-0">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Escribí tu consulta..."
            disabled={loading}
            autoComplete="off"
            className="flex-1"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            size="icon"
            className="w-10 h-10 rounded-full bg-[#FF6700] hover:bg-[#e05a00] shrink-0 shadow"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

      </div>
    </div>
  )
}
