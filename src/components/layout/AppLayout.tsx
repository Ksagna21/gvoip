import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    /* Fond page avec légère texture */
    <div className="min-h-screen bg-background noc-grid-bg" style={{ fontFamily: "'Raleway', sans-serif" }}>

      {/* Sidebar flottante (fixed, gérée dans AppSidebar) */}
      <AppSidebar />

      {/* Zone principale — décalée de w-56 (224px) + left-3 (12px) + gap (8px) = 244px */}
      <div className="ml-[244px] flex flex-col min-h-screen">

        {/* ── Topbar ── */}
        <header
          className="sticky top-0 z-30 flex items-center justify-end px-4"
          style={{ height: "52px" }}
        >
          <AppTopbar />
        </header>

        {/* ── Contenu ── */}
        <main className="flex-1 px-6 pb-10 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
