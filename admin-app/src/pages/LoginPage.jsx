// src/pages/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../services/firebase";
import { useAdminStore } from "../store/adminStore";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@nimbus.travel");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAdminStore((state) => state.setUser);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await adminLogin(email, password);

    if (result.success) {
      setUser(result.user);
      toast.success("Login successful!");
      navigate("/dashboard");
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-600 p-3 rounded-full">
            <LogIn className="text-white" size={32} />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">Nimbus Admin</h1>
        <p className="text-gray-600 text-center mb-8">
          Mountain Weather & Emergency SOS System
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-6 text-center">
          Demo credentials: admin@nimbus.travel / admin123
        </p>
      </div>
    </div>
  );
}