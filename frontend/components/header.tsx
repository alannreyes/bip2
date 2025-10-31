import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/datasources', label: 'Fuentes de Datos' },
    { href: '/syncs', label: 'Sincronizaciones' },
    { href: '/search/text', label: 'Búsqueda Texto' },
    { href: '/search', label: 'Búsqueda Imagen' },
    { href: '/duplicates', label: 'Duplicados' },
  ];

  return (
    <header className="border-b bg-white">
      <div className="flex h-16 items-center px-8">
        {/* Logo y título */}
        <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <div className="flex items-center space-x-2">
            {/* Logo EFC */}
            <div className="flex items-center">
              <span className="font-bold text-2xl bg-gradient-to-r from-secondary to-secondary/80 bg-clip-text text-transparent">
                EFC
              </span>
            </div>
            <div className="h-6 w-px bg-border"></div>
            <h1 className="text-lg font-semibold text-foreground">Catálogo Semántico</h1>
          </div>
        </Link>

        {/* Navegación */}
        <nav className="ml-8 flex items-center space-x-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors hover:text-primary ${
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Espacio para futuro logo/imagen */}
        <div className="ml-auto">
          {/* Aquí se puede agregar el logo de EFC como imagen */}
        </div>
      </div>
    </header>
  );
}
