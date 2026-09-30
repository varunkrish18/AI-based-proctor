import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import Landing from "./pages/Landing";
import Exams from "./pages/Exams";
import Instructions from "./pages/Instructions";
import About from "./pages/About";
import ExamVerify from "./pages/student/ExamVerify";
import SystemCheck from "./pages/student/SystemCheck";
import ExamTake from "./pages/student/ExamTake";
import ExamSubmitted from "./pages/student/ExamSubmitted";
import CodingAssessment from "./pages/student/CodingAssessment";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CreateExam from "./pages/admin/CreateExam";
import ExamDetail from "./pages/admin/ExamDetail";
import AdminReportView from "./pages/admin/AdminReportView";
import CodingAssessmentReports from "./pages/admin/CodingAssessmentReports";
import { isStaffAuthenticated } from "./api/client";

/**
 * Route protection for Admin and Examiner staff members only.
 * Unauthenticated users or non-staff are redirected to staff login.
 */
function StaffRoute({ children }: { children: React.ReactNode }) {
  if (!isStaffAuthenticated()) {
    return <Navigate to="/admin/login?unauthorized=true" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/instructions" element={<Instructions />} />
        <Route path="/about" element={<About />} />

        {/* Student assessment flow */}
        <Route path="/exam/:examId/verify" element={<ExamVerify />} />
        <Route path="/exam/:examId/system-check" element={<SystemCheck />} />
        <Route path="/exam/:examId/system_check" element={<SystemCheck />} />
        <Route path="/exam/:examId/take" element={<ExamTake />} />
        <Route path="/exam/:examId/submitted" element={<ExamSubmitted />} />

        {/* Staff-only Coding Lab & Sandbox (Strictly ADMIN & EXAMINER access) */}
        <Route
          path="/assessment/code-editor"
          element={
            <StaffRoute>
              <CodingAssessment />
            </StaffRoute>
          }
        />

        {/* Staff authentication */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Staff-only Admin & Examiner Management & Proctoring Portal */}
        <Route
          path="/admin/dashboard"
          element={
            <StaffRoute>
              <AdminDashboard />
            </StaffRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <StaffRoute>
              <Navigate to="/admin/dashboard?tab=users" replace />
            </StaffRoute>
          }
        />
        <Route
          path="/admin/coding-reports"
          element={
            <StaffRoute>
              <CodingAssessmentReports />
            </StaffRoute>
          }
        />
        <Route
          path="/admin/exams/new"
          element={
            <StaffRoute>
              <CreateExam />
            </StaffRoute>
          }
        />
        <Route
          path="/admin/exams/:examId"
          element={
            <StaffRoute>
              <ExamDetail />
            </StaffRoute>
          }
        />
        <Route
          path="/admin/exams/:examId/attempts/:attemptId"
          element={
            <StaffRoute>
              <AdminReportView />
            </StaffRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
