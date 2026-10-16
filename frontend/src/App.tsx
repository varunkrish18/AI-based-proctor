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
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CourseCoordinatorDashboard from "./pages/admin/CourseCoordinatorDashboard";
import CreateExam from "./pages/admin/CreateExam";
import ExamDetail from "./pages/admin/ExamDetail";
import AdminReportView from "./pages/admin/AdminReportView";
import MobileDeviceBlocker from "./components/MobileDeviceBlocker";
import OnlineIde from "./pages/OnlineIde";
import { isStaffAuthenticated, isCoordinatorRole } from "./api/client";

/**
 * Route protection for Admin, Examiner, Course Coordinator, and Faculty staff members.
 * Unauthenticated users or non-staff are redirected to staff login.
 */
function StaffRoute({ children }: { children: React.ReactNode }) {
  if (!isStaffAuthenticated()) {
    return <Navigate to="/admin/login?unauthorized=true" replace />;
  }
  return <>{children}</>;
}

function StaffDashboard() {
  if (isCoordinatorRole()) {
    return <CourseCoordinatorDashboard />;
  }
  return <AdminDashboard />;
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
        <Route path="/ide" element={<OnlineIde />} />
        <Route path="/online-ide" element={<OnlineIde />} />

        {/* Student assessment flow (Blocked on Mobile / Tablets even in Desktop Mode) */}
        <Route
          path="/exam/:examId/verify"
          element={
            <MobileDeviceBlocker>
              <ExamVerify />
            </MobileDeviceBlocker>
          }
        />
        <Route
          path="/exam/:examId/system-check"
          element={
            <MobileDeviceBlocker>
              <SystemCheck />
            </MobileDeviceBlocker>
          }
        />
        <Route
          path="/exam/:examId/system_check"
          element={
            <MobileDeviceBlocker>
              <SystemCheck />
            </MobileDeviceBlocker>
          }
        />
        <Route
          path="/exam/:examId/take"
          element={
            <MobileDeviceBlocker>
              <ExamTake />
            </MobileDeviceBlocker>
          }
        />
        <Route path="/exam/:examId/submitted" element={<ExamSubmitted />} />

        {/* Staff authentication */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Staff-only Admin, Examiner, and Coordinator Management & Proctoring Portal */}
        <Route
          path="/admin/dashboard"
          element={
            <StaffRoute>
              <StaffDashboard />
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
