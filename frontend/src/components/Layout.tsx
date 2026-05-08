import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { logoutUser } from "../api/auth";

type Props = { children: ReactNode };

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      window.location.href = "/";
    }
  };

  const navLink = (to: string, icon: string, label: string) => {
    const isActive =
      pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
    return (
      <li className="nav-item">
        <Link
          to={to}
          className={`nav-link px-3 py-2 ${isActive ? "active fw-semibold text-white" : "text-white-50"}`}
        >
          <i className={`fa ${icon} me-2`} />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-dark" style={{ background: "#37474f" }}>
        <div className="container-fluid">
          <span className="navbar-brand fw-bold">
            <i className="fa fa-graduation-cap me-2" />
            Кабинет директора
          </span>
          <ul className="navbar-nav flex-row gap-1 me-auto ms-4">
            {navLink("/dashboard", "fa-house", "Главная")}
            {navLink("/organizations", "fa-university", "Организации")}
            {navLink("/employees", "fa-users", "Кадры")}
            {navLink("/buildings", "fa-building", "Здания")}
          </ul>
          <button
            className="btn btn-sm btn-outline-light"
            onClick={() => void handleLogout()}
          >
            <i className="fa fa-right-from-bracket me-1" />
            Выйти
          </button>
        </div>
      </nav>

      <div className="container-fluid py-4 px-4 flex-grow-1 bg-light">
        {children}
      </div>
    </div>
  );
}
