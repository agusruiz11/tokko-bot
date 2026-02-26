export interface Property {
  titulo:            string
  tipo?:             string
  operacion?:        string
  precio?:           number
  moneda?:           string
  ambientes?:        number
  superficieCubierta?: number
  banos?:            number
  cocheras?:         boolean
  zona?:             string
  fotoPrincipal?:    string
  urlFicha?:         string
}

export function PropertyCard({ property: p }: { property: Property }) {
  const precio = p.precio
    ? `${p.moneda} ${p.precio.toLocaleString('es-AR')}`
    : ''

  const detalles = [
    p.ambientes          ? `${p.ambientes} amb.`                       : null,
    p.superficieCubierta ? `${p.superficieCubierta} m²`                : null,
    p.banos              ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : null,
    p.cocheras           ? 'cochera'                                    : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl overflow-hidden bg-white shadow-md border-t-[3px] border-t-[#FF6700] w-[272px]">
      {p.fotoPrincipal && (
        <img
          src={p.fotoPrincipal}
          alt={p.titulo}
          className="w-full h-36 object-cover block"
          onError={e => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="p-3 space-y-1">
        <h3 className="text-[13px] font-semibold text-gray-800 leading-tight">{p.titulo}</h3>
        {precio   && <div className="text-[17px] font-bold text-[#FF6700]">{precio}</div>}
        {detalles && <div className="text-[12px] text-gray-500">{detalles}</div>}
        {p.zona   && <div className="text-[12px] text-gray-500">📍 {p.zona}</div>}
        {p.urlFicha && (
          <a
            href={p.urlFicha}
            target="_blank"
            rel="noopener noreferrer"
            className="!mt-2 block text-center bg-[#003BD3] hover:bg-[#0030b0] text-white text-[13px] font-semibold py-2 rounded-lg transition-colors no-underline"
          >
            Ver ficha y agendar visita →
          </a>
        )}
      </div>
    </div>
  )
}
