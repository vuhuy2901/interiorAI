import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, ExternalLink, Maximize2, RotateCcw } from "lucide-react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useTheme } from "@/context/ThemeContext";
import { useAtelierStudio } from "./AtelierStudioContext";

export function AtelierOfficeSimulationPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { theme } = useTheme();
  const { activeProjectId } = useAtelierStudio();
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Thiết kế Nội thất" },
      { label: "Mô phỏng công ty 3D (HOME&CO)" },
    ]);
  }, [setBreadcrumbs]);

  const handleReload = () => {
    setReloadKey((k) => k + 1);
  };

  const handleFullScreen = () => {
    const el = iframeRef.current;
    if (el) {
      if (el.requestFullscreen) {
        void el.requestFullscreen();
      }
    }
  };

  return (
    <div className="atelier-surface-root flex h-full w-full flex-col overflow-hidden" data-theme={theme}>
      <header className="atelier-studio-header flex items-center justify-between px-3 py-2 border-b border-border bg-card/60 backdrop-blur-sm gap-2">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Link to="/design-studio" className="btn btn-sm shrink-0" title="Quay lại Không gian thiết kế 2D/3D">
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Thiết kế 3D</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1 rounded bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Building2 size={16} />
            </div>
            <span className="font-semibold text-sm whitespace-nowrap">HOME&CO · Mô phỏng công ty 3D</span>
          </div>
          <span className="status-badge emerald text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0">
            15 Agents Realtime
          </span>
          <span className="status-badge sky text-xs px-2 py-0.5 rounded-full font-medium hidden md:inline-flex whitespace-nowrap shrink-0">
            Three.js 3D
          </span>
          <span className="status-badge amber text-xs px-2 py-0.5 rounded-full font-medium hidden lg:inline-flex whitespace-nowrap shrink-0">
            A* Navigation &amp; Cycle 24h
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1.5"
            onClick={handleFullScreen}
            title="Xem toàn màn hình"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">Toàn màn hình</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1.5"
            onClick={handleReload}
            title="Khởi động lại mô phỏng 3D"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Tải lại</span>
          </button>
          <a
            href={`/ai-office/index.html?project_id=${encodeURIComponent(activeProjectId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-primary gap-1.5"
            title="Mở trong tab trình duyệt độc lập"
          >
            <ExternalLink size={13} />
            <span>Mở tab riêng</span>
          </a>
        </div>
      </header>
      <div className="flex-1 w-full h-full relative overflow-hidden bg-[#07090c]">
        <iframe
          ref={iframeRef}
          key={reloadKey}
          src={`/ai-office/index.html?project_id=${encodeURIComponent(activeProjectId)}`}
          title="HOME&CO Interior · Mô phỏng công ty 3D"
          className="w-full h-full border-0 block"
          allow="autoplay; fullscreen; clipboard-write"
        />
      </div>
    </div>
  );
}
