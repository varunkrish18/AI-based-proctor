import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Landing from "./pages/Landing";
import Exams from "./pages/Exams";
import Instructions from "./pages/Instructions";
import About from "./pages/About";
import ExamVerify from "./pages/student/ExamVerify";
import SystemCheck from "./pages/student/SystemCheck";
import ExamTake from "./pages/student/ExamTake";
import ExamSubmitted from "./pages/student/ExamSubmitted";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CreateExam from "./pages/admin/CreateExam";
import ExamDetail from "./pages/admin/ExamDetail";
import AdminReportView from "./pages/admin/AdminReportView";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/instructions" element={<Instructions />} />
        <Route path="/about" element={<About />} />

        {/* Student exam flow: verify -> system check -> take -> submitted */}
        <Route path="/exam/:examId/verify" element={<ExamVerify />} />
        <Route path="/exam/:examId/system-check" element={<SystemCheck />} />
        <Route path="/exam/:examId/take" element={<ExamTake />} />
        <Route path="/exam/:examId/submitted" element={<ExamSubmitted />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/exams/new" element={<CreateExam />} />
        <Route path="/admin/exams/:examId" element={<ExamDetail />} />
        <Route path="/admin/exams/:examId/attempts/:attemptId" element={<AdminReportView />} />
      </Routes>
    </BrowserRouter>
  );
}
