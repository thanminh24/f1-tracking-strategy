"use client";
// Collapsible icon-only side nav. Replay/Telemetry are tabs in the home dashboard.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav() {
  const pathname = usePathname() ?? "";

  const items = [
    {
      label: "Dashboard",
      href: "/",
      active: pathname === "/" || pathname.startsWith("/session"),
      // Home icon
      icon: "M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z",
    },
    {
      label: "Archive",
      href: "/",
      active: pathname.startsWith("/season"),
      // Database rows icon
      icon: "M4 6a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 6a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z",
    },
  ];

  return (
    <nav
      className={[
        "group flex flex-col shrink-0 h-full",
        "w-12 hover:w-44 transition-[width] duration-200 overflow-hidden",
        "bg-f1-panel border-r border-f1-border z-10",
      ].join(" ")}
    >
      <ul className="flex flex-col gap-0.5 pt-2 px-1">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className={[
                "flex items-center gap-3 px-2 py-2 rounded-md whitespace-nowrap",
                "text-xs font-medium transition-colors duration-100",
                item.active
                  ? "bg-f1-red/15 text-f1-red"
                  : "text-f1-muted hover:text-f1-text hover:bg-f1-panel-hover",
              ].join(" ")}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 shrink-0"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d={item.icon} clipRule="evenodd" />
              </svg>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
