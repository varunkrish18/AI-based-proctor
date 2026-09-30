import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { getAdminUserRole, isStaffAuthenticated, clearToken } from "../api/client";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
    isActive ? "bg-indigo-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;

export default function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(getAdminUserRole());
  const isStaff = isStaffAuthenticated();

  useEffect(() => {
    // Re-evaluate current authentication role on route navigation
    setRole(getAdminUserRole());
  }, [location.pathname]);

  const handleLogout = () => {
    clearToken("admin");
    setRole(null);
    navigate("/admin/login");
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-2.5">
        <NavLink to="/" className="flex items-center gap-2 text-white font-bold text-sm tracking-wide">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-xs">
            🛡️
          </span>
          <span>AI Exam &amp; Proctoring Portal</span>
        </NavLink>

        <div className="flex items-center gap-1.5">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/exams" className={linkClass}>
            Exams
          </NavLink>
          <NavLink to="/instructions" className={linkClass}>
            Instructions
          </NavLink>
          <NavLink to="/about" className={linkClass}>
            About
          </NavLink>

          {/* Coding Lab & Assessment Reports - strictly restricted to Admin and Examiner */}
          {isStaff && (
            <>
              <div className="h-4 w-px bg-slate-700 mx-1" />
              <NavLink to="/assessment/code-editor" className={linkClass}>
                &lt;/&gt; Coding Lab
              </NavLink>
              <NavLink to="/admin/coding-reports" className={linkClass}>
                📊 Assessment Reports
              </NavLink>
              <NavLink to="/admin/dashboard" className={linkClass}>
                🎛️ Dashboard
              </NavLink>
              {role === "ADMIN" && (
                <NavLink to="/admin/dashboard?tab=users" className={linkClass}>
                  👥 User Accounts
                </NavLink>
              )}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ml-1 border ${
                  role === "ADMIN"
                    ? "bg-purple-900/60 text-purple-300 border-purple-700/60"
                    : "bg-emerald-900/60 text-emerald-300 border-emerald-700/60"
                }`}
              >
                {role}
              </span>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-slate-800 rounded-lg transition-colors ml-1 cursor-pointer"
                title="Log out from staff session"
              >
                Sign Out
              </button>
            </>
          )}

          {!isStaff && (
            <NavLink to="/admin/login" className={linkClass}>
              Staff Login
            </NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}
