import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  getAvailableRoles,
  switchUserRole,
  isUserAuthenticated,
  isStaffAuthenticated,
  clearAllAuth,
} from "../api/client";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
    isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;

export default function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState<boolean>(isUserAuthenticated());
  const [user, setUser] = useState(getCurrentUser());
  const [availableRoles, setAvailableRoles] = useState<string[]>(getAvailableRoles());
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Re-evaluate current authentication and user state on route navigation
    setAuthenticated(isUserAuthenticated());
    const cur = getCurrentUser();
    setUser(cur);
    setAvailableRoles(getAvailableRoles());
  }, [location.pathname]);

  useEffect(() => {
    const handleRoleChanged = () => {
      const cur = getCurrentUser();
      setUser(cur);
      setAvailableRoles(getAvailableRoles());
    };
    window.addEventListener("aeps_role_changed", handleRoleChanged);
    return () => window.removeEventListener("aeps_role_changed", handleRoleChanged);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
    }
    if (showRoleMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showRoleMenu]);

  const handleLogout = () => {
    clearAllAuth();
    setAuthenticated(false);
    setUser(null);
    navigate("/sign-in", { replace: true });
  };

  const handleRoleSwitch = async (targetRole: string) => {
    if (switchingRole || targetRole === user?.role?.toUpperCase()) {
      setShowRoleMenu(false);
      return;
    }
    setSwitchingRole(true);
    try {
      await switchUserRole(targetRole);
      setShowRoleMenu(false);
      // Reload or navigate to refresh all permissions and dashboards immediately
      navigate(0);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to switch role");
    } finally {
      setSwitchingRole(false);
    }
  };

  const role = user?.role?.toUpperCase();
  const isStaff = isStaffAuthenticated();

  const getRoleLabel = (r: string) => {
    switch (r) {
      case "COURSE_COORDINATOR":
        return "COORDINATOR";
      case "PROFESSOR":
        return "PROFESSOR";
      case "ADMIN":
        return "ADMIN";
      case "FACULTY":
        return "FACULTY";
      default:
        return r;
    }
  };

  const getRoleNiceName = (r: string) => {
    switch (r) {
      case "COURSE_COORDINATOR":
        return "🏛️ Course Coordinator";
      case "PROFESSOR":
        return "👨‍🏫 Professor / Faculty";
      case "ADMIN":
        return "👑 Administrator";
      case "FACULTY":
        return "👨‍🏫 Department Faculty";
      default:
        return r;
    }
  };

  const getRoleDescription = (r: string) => {
    switch (r) {
      case "COURSE_COORDINATOR":
        return "Department syllabus, class templates & faculty oversight";
      case "PROFESSOR":
        return "Question configuration, assign section students & report review";
      default:
        return "Active workspace";
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-2.5">
        <NavLink
          to={authenticated ? "/" : "/sign-in"}
          className="flex items-center gap-2 text-white font-bold text-sm tracking-wide"
        >
          <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-xs shadow-md shadow-indigo-500/20">
            🛡️
          </span>
          <span>AI Exam &amp; Proctoring Portal</span>
        </NavLink>

        <div className="flex items-center gap-1.5">
          {authenticated ? (
            <>
              <NavLink to="/" end className={linkClass}>
                Home
              </NavLink>
              <NavLink to="/exams" className={linkClass}>
                Exams
              </NavLink>
              <NavLink to="/instructions" className={linkClass}>
                Instructions
              </NavLink>
              <NavLink to="/ide" className={linkClass}>
                💻 Online IDE
              </NavLink>

              {/* Staff controls */}
              {isStaff && (
                <>
                  <div className="h-4 w-px bg-slate-700 mx-1" />
                  <NavLink to="/admin/dashboard" className={linkClass}>
                    🎛️ Dashboard
                  </NavLink>
                  {role === "ADMIN" && (
                    <NavLink to="/admin/dashboard?tab=users" className={linkClass}>
                      👥 Users
                    </NavLink>
                  )}
                </>
              )}

              {/* User Identity Chip */}
              <div className="flex items-center gap-2 pl-2 ml-1 border-l border-slate-700">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-200 leading-tight">
                    {user?.fullName || "User"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {user?.identifier || user?.email}
                  </span>
                </div>

                {/* Role Badge & Role Switcher */}
                <div className="relative" ref={roleMenuRef}>
                  {availableRoles.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setShowRoleMenu((v) => !v)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border flex items-center gap-1 cursor-pointer transition-all hover:brightness-125 select-none ${
                        role === "ADMIN"
                          ? "bg-purple-900/60 text-purple-300 border-purple-700/60"
                          : role === "COURSE_COORDINATOR"
                          ? "bg-blue-900/60 text-blue-300 border-blue-700/60"
                          : role === "PROFESSOR" || role === "FACULTY"
                          ? "bg-emerald-900/60 text-emerald-300 border-emerald-700/60"
                          : "bg-amber-900/60 text-amber-300 border-amber-700/60"
                      }`}
                      title="Click to switch active workspace"
                    >
                      <span>{getRoleLabel(role || "USER")}</span>
                      <span className="text-[8px] opacity-75">▾</span>
                    </button>
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        role === "ADMIN"
                          ? "bg-purple-900/60 text-purple-300 border-purple-700/60"
                          : role === "COURSE_COORDINATOR"
                          ? "bg-blue-900/60 text-blue-300 border-blue-700/60"
                          : role === "PROFESSOR" || role === "FACULTY"
                          ? "bg-emerald-900/60 text-emerald-300 border-emerald-700/60"
                          : "bg-amber-900/60 text-amber-300 border-amber-700/60"
                      }`}
                    >
                      {getRoleLabel(role || "USER")}
                    </span>
                  )}

                  {/* Dropdown Menu for Dual-Role Users */}
                  {showRoleMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95">
                      <div className="px-3 py-1.5 border-b border-slate-700/80 mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                          Switch Workspace
                        </span>
                        <span className="text-[11px] text-slate-300 truncate block">
                          {user?.fullName}
                        </span>
                      </div>

                      <div className="space-y-1 px-1">
                        {availableRoles.map((r) => {
                          const isActive = r.toUpperCase() === role;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleRoleSwitch(r)}
                              disabled={switchingRole || isActive}
                              className={`w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer flex flex-col gap-0.5 ${
                                isActive
                                  ? "bg-indigo-600/30 border border-indigo-500/40 text-white cursor-default"
                                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span>{getRoleNiceName(r)}</span>
                                {isActive && (
                                  <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded-full font-semibold">
                                    Active
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 leading-tight">
                                {getRoleDescription(r)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {switchingRole && (
                        <div className="px-3 pt-2 text-[11px] text-indigo-300 flex items-center gap-1.5">
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Switching workspace...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Sign out of portal session"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <NavLink
              to="/sign-in"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>🔑</span>
              <span>Sign In</span>
            </NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}
