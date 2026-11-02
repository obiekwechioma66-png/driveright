import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, homeForRole } from "./auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import LearnerDashboard from "./pages/LearnerDashboard";
import LearnerPackages from "./pages/LearnerPackages";
import BookLesson from "./pages/BookLesson";
import PaymentCallback from "./pages/PaymentCallback";
import InstructorDashboard from "./pages/InstructorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import { DashLayout } from "./pages/DashLayout";
import Contact from "./pages/Contact";
import Profile from "./pages/Profile";
import AdminSchoolSettings from "./pages/AdminSchoolSettings";
import StaffInvite from "./pages/StaffInvite";

// Role gate. Signed-out users go to login; wrong roles are redirected to their
// OWN dashboard — a learner can never open /instructor or /admin (the API
// enforces it too with 401/403, see server/middleware/auth.js).
function RequireRole({ role, loginPath, children }) {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <Navigate to={loginPath || "/login"} replace />;
  if (user.role !== role) return <Navigate to={homeForRole(user.role)} replace />;
  // Each dashboard page renders its own DashLayout chrome — no double wrapper here.
  return children;
}
function RequirePersonalRole({ children }) {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!["learner", "instructor"].includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/staff/login" element={<Login portalRole="instructor" />} />
          <Route path="/admin/login" element={<Login portalRole="admin" />} />
          <Route path="/staff/invite" element={<StaffInvite />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/learner" element={<RequireRole role="learner" loginPath="/login"><LearnerDashboard /></RequireRole>} />
          <Route path="/packages" element={<RequireRole role="learner"><LearnerPackages /></RequireRole>} />
          <Route path="/book" element={<RequireRole role="learner"><BookLesson /></RequireRole>} />
          <Route path="/payment/callback" element={<RequireRole role="learner" loginPath="/login"><PaymentCallback /></RequireRole>} />
          <Route path="/instructor" element={<RequireRole role="instructor" loginPath="/staff/login"><InstructorDashboard /></RequireRole>} />
          <Route path="/profile" element={<RequirePersonalRole><Profile /></RequirePersonalRole>} />
          <Route path="/admin" element={<RequireRole role="admin" loginPath="/admin/login"><AdminDashboard /></RequireRole>} />
          <Route path="/admin/settings" element={<RequireRole role="admin" loginPath="/admin/login"><AdminSchoolSettings /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
