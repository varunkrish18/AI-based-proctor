import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import ResetPassword from "./pages/ResetPassword";
import Exams from "./pages/Exams";
import Instructions from "./pages/Instructions";
import About from "./pages/About";
import ExamVerify from "./pages/student/ExamVerify";
import SystemCheck from "./pages/student/SystemCheck";
import ExamTake from "./pages/student/ExamTake";
import ExamSubmitted from "./pages/student/ExamSubmitted";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CourseCoordinatorDashboard from "./pages/admin/CourseCoordinatorDashboard";
import CreateExam from "./pages/admin/CreateExam";
import ExamDetail from "./pages/admin/ExamDetail";
import AdminReportView from "./pages/admin/AdminReportView";
import MobileDeviceBlocker from "./components/MobileDeviceBlocker";
import OnlineIde from "./pages/OnlineIde";
import {
  isUserAuthenticated,
  getMustResetPassword,
  isStaffAuthenticated,
  isCoordinatorRole,
} from "./api/client";

/**
 * Route protection for authenticated users.
 * Redirects to /sign-in if unauthenticated, or to /reset-password if initial reset is pending.
 */
function AuthRoute({ children }: { children: React.ReactNode }) {
  if (!isUserAuthenticated()) {
    return <Navigate to="/sign-in" replace />;
  }
  if (getMustResetPassword()) {
    return <Navigate to="/reset-password" replace />;
  }
  return <>{children}</>;
}

/**
 * Route protection for the Sign In page.
 * If already authenticated, routes to /reset-password or / (Home).
 */
function SignInRoute() {
  if (isUserAuthenticated()) {
    if (getMustResetPassword()) {
      return <Navigate to="/reset-password" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <SignIn />;
}

/**
 * Route protection for the Reset Password page.
 * Only accessible if the user is authenticated AND mustResetPassword is true.
 */
function ResetPasswordRoute() {
  if (!isUserAuthenticated()) {
    return <Navigate to="/sign-in" replace />;
  }
  if (!getMustResetPassword()) {
    return <Navigate to="/" replace />;
  }
  return <ResetPassword />;
}

/**
 * Route protection for Admin, Examiner, Course Coordinator, and Faculty staff members.
 */
function StaffRoute({ children }: { children: React.ReactNode }) {
  if (!isStaffAuthenticated()) {
    return <Navigate to="/sign-in?unauthorized=true" replace />;
  }
  if (getMustResetPassword()) {
    return <Navigate to="/reset-password" replace />;
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
        {/* Authentication & Onboarding Routes */}
        <Route path="/sign-in" element={<SignInRoute />} />
        <Route path="/reset-password" element={<ResetPasswordRoute />} />

        {/* Unified Home Page for Admin, Coordinator, Professor, and Student */}
        <Route
          path="/"
          element={
            <AuthRoute>
              <Home />
            </AuthRoute>
          }
        />

        {/* Examination & Candidate Features */}
        <Route
          path="/exams"
          element={
            <AuthRoute>
              <Exams />
            </AuthRoute>
          }
        />
        <Route
          path="/instructions"
          element={
            <AuthRoute>
              <Instructions />
            </AuthRoute>
          }
        />
        <Route path="/about" element={<About />} />
        <Route
          path="/ide"
          element={
            <AuthRoute>
              <OnlineIde />
            </AuthRoute>
          }
        />
        <Route
          path="/online-ide"
          element={
            <AuthRoute>
              <OnlineIde />
            </AuthRoute>
          }
        />

        {/* Student assessment flow (Blocked on Mobile / Tablets even in Desktop Mode) */}
        <Route
          path="/exam/:examId/verify"
          element={
            <AuthRoute>
              <MobileDeviceBlocker>
                <ExamVerify />
              </MobileDeviceBlocker>
            </AuthRoute>
          }
        />
        <Route
          path="/exam/:examId/system-check"
          element={
            <AuthRoute>
              <MobileDeviceBlocker>
                <SystemCheck />
              </MobileDeviceBlocker>
            </AuthRoute>
          }
        />
        <Route
          path="/exam/:examId/system_check"
          element={
            <AuthRoute>
              <MobileDeviceBlocker>
                <SystemCheck />
              </MobileDeviceBlocker>
            </AuthRoute>
          }
        />
        <Route
          path="/exam/:examId/take"
          element={
            <AuthRoute>
              <MobileDeviceBlocker>
                <ExamTake />
              </MobileDeviceBlocker>
            </AuthRoute>
          }
        />
        <Route
          path="/exam/:examId/submitted"
          element={
            <AuthRoute>
              <ExamSubmitted />
            </AuthRoute>
          }
        />

        {/* Staff authentication alias */}
        <Route path="/admin/login" element={<Navigate to="/sign-in" replace />} />

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
