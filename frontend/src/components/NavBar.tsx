import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  getCurrentUser,
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

  useEffect(() => {
    // Re-evaluate current authentication and user state on route navigation
    setAuthenticated(isUserAuthenticated());
    setUser(getCurrentUser());
  }, [location.pathname]);

  const handleLogout = () => {
    clearAllAuth();
    setAuthenticated(false);
    setUser(null);
    navigate("/sign-in", { replace: true });
  };

  const role = user?.role?.toUpperCase();
  const isStaff = isStaffAuthenticated();

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
                  {role === "COURSE_COORDINATOR" ? "COORDINATOR" : role || "USER"}
                </span>

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
