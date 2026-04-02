import { AppSidebar, AppTopbar } from "./AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    /* Fond page avec légère texture */
    <div className="overflow-y-scroll [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] transition-all duration-300 max-h-screen bg-white flex dark:bg-transparent relative" style={{ fontFamily: "Manrope, sans-serif" }}>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:1, zIndex:0}}>
          <defs>
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="hsl(var(--border))" opacity="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
        </svg>
      {/* Sidebar (responsive : cachée sur mobile, visible sur md+) */}
      <AppSidebar />

      {/* Zone principale — décalée selon l'écran */}
      {/* Desktop: ml-[244px] (w-56 + left-3*2 + gap), Mobile: tête fixe, pas de décalage */}
      <div className="flex flex-1 w-full flex-col min-h-screen z-10">

        {/* ── Topbar (visible toujours, mobile burger, desktop time) ── */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between md:justify-end px-4 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
          style={{ height: "52px" }}
        >
          <AppTopbar />
        </header>

        {/* ── Contenu ── */}
        <main className="flex-1 px-4 md:px-6 z-10 pb-10 pt-6 overflow-y-auto mx-0 bg-transparent dark:bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
};
