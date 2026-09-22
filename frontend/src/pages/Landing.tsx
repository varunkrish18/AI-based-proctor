import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">
        Secure Online Examinations, Fairly Proctored
      </h1>
      <p className="text-slate-600 text-lg mb-8">
        Take proctored MCQ examinations from anywhere. Your session is monitored
        for integrity signals — never a single automatic accusation — and every
        flagged moment is reviewed by a human before any action is taken.
      </p>
      <div className="flex justify-center gap-4">
        <Link to="/exams" className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700">
          View Available Exams
        </Link>
        <Link to="/instructions" className="border border-slate-300 px-6 py-3 rounded-md font-medium text-slate-700 hover:bg-slate-100">
          Read Instructions
        </Link>
      </div>
    </div>
  );
}
