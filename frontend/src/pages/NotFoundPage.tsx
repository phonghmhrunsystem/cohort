import { Link } from "react-router-dom";

export function NotFoundPage() { return <main><h1>Page not found</h1><Link style={{ minHeight: 44 }} to="/dashboard">Go to dashboard</Link></main>; }
