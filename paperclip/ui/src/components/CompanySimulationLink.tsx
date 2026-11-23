import { Building2, ExternalLink } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, SIDEBAR_RAIL_HIDDEN_LABEL } from "../lib/utils";
import { TruncatedText } from "./TruncatedText";

export const COMPANY_SIMULATION_URL = "http://localhost:8123/";

export function CompanySimulationLink() {
  const { isMobile, setSidebarOpen, collapsed, peeking } = useSidebar();
  const rail = collapsed && !peeking;
  const link = (
    <a
      href={COMPANY_SIMULATION_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="company-simulation-link"
      aria-label={rail ? "Mô phỏng công ty" : undefined}
      onClick={() => { if (isMobile) setSidebarOpen(false); }}
      className={cn(
        "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors",
        "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <span data-slot="sidebar-nav-icon" className="relative shrink-0">
        <Building2 className="h-4 w-4" aria-hidden="true" />
      </span>
      <TruncatedText className={rail ? SIDEBAR_RAIL_HIDDEN_LABEL : "min-w-0 flex-1 truncate"}>
        Mô phỏng công ty
      </TruncatedText>
      {!rail ? <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </a>
  );

  if (!rail) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{link}</div></TooltipTrigger>
      <TooltipContent side="right">Mô phỏng công ty</TooltipContent>
    </Tooltip>
  );
}
