import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-md transition-colors ${
    isActive ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-slate-700"
  }`;

export default function NavBar() {
  return (
    <header className="bg-slate-900 sticky top-0 z-20 shadow-md">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <NavLink to="/" className="text-white font-semibold tracking-wide">
          AI Exam &amp; Proctoring Portal
        </NavLink>
        <div className="flex gap-1">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/exams" className={linkClass}>Exams</NavLink>
          <NavLink to="/instructions" className={linkClass}>Instructions</NavLink>
          <NavLink to="/about" className={linkClass}>About</NavLink>
          <NavLink to="/admin/login" className={linkClass}>Admin Login</NavLink>
        </div>
      </nav>
    </header>
  );
}
