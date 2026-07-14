import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { logoutUser } from "../api/auth";
import { fetchProfile, type Profile } from "../api/data";
import NotificationBell from "./NotificationBell";

type Props = { children: ReactNode };

export default function Layout({ children }: Props) {
  const { pathname, search } = useLocation();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const dataMenuRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }

      if (dataMenuRef.current && !dataMenuRef.current.contains(target)) {
        setDataMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      window.location.href = "/";
    }
  };

  const isHomeActive = pathname === "/dashboard";
  const isCalendarActive = pathname === "/calendar";
  const isDocumentsActive = pathname === "/documents";
  const isDocumentTemplatesActive = pathname === "/document-templates";
  const isIncidentsActive = pathname === "/incidents";

  const isDataActive =
    pathname.startsWith("/organizations") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/buildings");

  const fullName =
    [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") || null;

  const userLabel = fullName || profile?.email || "Аккаунт";

  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    (profile?.email?.[0]?.toUpperCase() ?? "U");

  const closeDataMenu = () => setDataMenuOpen(false);

  const dataLinkClass = (isActive = false) =>
    `d-flex align-items-center gap-2 px-3 py-2 text-decoration-none ${
      isActive ? "text-dark fw-semibold" : "text-dark"
    } data-menu-link`;

  const isEmployeesAllActive = pathname === "/employees" && !search;
  const isAdmActive = pathname === "/employees" && search.includes("cat=ADM");
  const isTeachActive = pathname === "/employees" && search.includes("cat=TEACH");
  const isTechActive = pathname === "/employees" && search.includes("cat=TECH");
  const isOrganizationsActive = pathname === "/organizations";
  const isBuildingsActive = pathname === "/buildings";

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav
        className="navbar navbar-dark shadow-sm sticky-top"
        style={{
          background: "linear-gradient(135deg, #37474f, #455a64)",
          minHeight: 92,
        }}
      >
        <div className="container-fluid px-4 py-2">
          <Link to="/dashboard" className="navbar-brand d-flex align-items-center mb-0" style={{ textDecoration: "none" }}>
            <img src="/logo-white.svg" alt="ИЦТО" style={{ height: 52, objectFit: "contain" }} />
          </Link>

          <ul className="navbar-nav flex-row gap-2 me-auto ms-4 align-items-center">
            <li className="nav-item">
              <Link
                to="/dashboard"
                className={`nav-link px-3 py-2 rounded-pill ${
                  isHomeActive ? "layout-nav-active" : "layout-nav-default"
                }`}
              >
                <i className="fa fa-house me-2" />
                Главная
              </Link>
            </li>

            <li className="nav-item">
              <Link
                to="/calendar"
                className={`nav-link px-3 py-2 rounded-pill ${
                  isCalendarActive ? "layout-nav-active" : "layout-nav-default"
                }`}
              >
                <i className="fa fa-calendar me-2" />
                Календарь
              </Link>
            </li>

            <li className="nav-item">
              <Link
                to="/documents"
                className={`nav-link px-3 py-2 rounded-pill ${
                  isDocumentsActive ? "layout-nav-active" : "layout-nav-default"
                }`}
              >
                <i className="fa fa-folder-open me-2" />
                Документы
              </Link>
            </li>

            <li className="nav-item">
              <Link
                to="/document-templates"
                className={`nav-link px-3 py-2 rounded-pill ${
                  isDocumentTemplatesActive ? "layout-nav-active" : "layout-nav-default"
                }`}
              >
                <i className="fa fa-file-pen me-2" />
                Конструктор
              </Link>
            </li>

            <li className="nav-item">
              <Link
                to="/incidents"
                className={`nav-link px-3 py-2 rounded-pill ${
                  isIncidentsActive ? "layout-nav-active" : "layout-nav-default"
                }`}
              >
                <i className="fa fa-triangle-exclamation me-2" />
                Инциденты
              </Link>
            </li>

            <li className="nav-item position-relative" ref={dataMenuRef}>
              <button
                type="button"
                className={`nav-link px-3 py-2 rounded-pill border-0 d-flex align-items-center ${
                  isDataActive ? "layout-nav-active" : "layout-nav-default"
                }`}
                style={{ background: "transparent" }}
                onClick={() => setDataMenuOpen((prev) => !prev)}
              >
                <i className="fa fa-database me-2" />
                Данные
                <i
                  className={`fa ${
                    dataMenuOpen ? "fa-chevron-up" : "fa-chevron-down"
                  } ms-2`}
                  style={{ fontSize: 11 }}
                />
              </button>

              {dataMenuOpen && (
                <div
                  className="position-absolute start-0 mt-2 bg-white rounded-4 shadow border overflow-hidden"
                  style={{ minWidth: 420, zIndex: 1000 }}
                >
                  <div className="px-3 pt-3 pb-2 text-uppercase text-muted fw-semibold small">
                    Кадровый состав
                  </div>

                  <Link
                    to="/employees"
                    className={dataLinkClass(isEmployeesAllActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-id-card text-secondary" />
                    <span>Все сотрудники</span>
                  </Link>

                  <Link
                    to="/employees?cat=ADM"
                    className={dataLinkClass(isAdmActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-user-tie text-secondary" />
                    <span>Административно-управленческий персонал</span>
                  </Link>

                  <Link
                    to="/employees?cat=TEACH"
                    className={dataLinkClass(isTeachActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-chalkboard-user text-secondary" />
                    <span>Педагогические кадры + УВП</span>
                  </Link>

                  <Link
                    to="/employees?cat=TECH"
                    className={dataLinkClass(isTechActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-wrench text-secondary" />
                    <span>Младший обслуживающий персонал</span>
                  </Link>

                  <div className="px-3 pt-3 pb-2 text-uppercase text-muted fw-semibold small border-top">
                    Материально-техническая база
                  </div>

                  <Link
                    to="/organizations"
                    className={dataLinkClass(isOrganizationsActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-university text-secondary" />
                    <span>Образовательные организации</span>
                  </Link>

                  <Link
                    to="/buildings"
                    className={dataLinkClass(isBuildingsActive)}
                    onClick={closeDataMenu}
                  >
                    <i className="fa fa-building text-secondary" />
                    <span>Здания</span>
                  </Link>
                </div>
              )}
            </li>
          </ul>

          <NotificationBell />

          <div className="position-relative" ref={userMenuRef}>
            <button
              className="border-0 d-flex align-items-center gap-3 px-2 py-1 profile-trigger"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              style={{
                background: "transparent",
                color: "white",
                borderRadius: 999,
              }}
            >
              <div
                className="d-flex align-items-center justify-content-center fw-semibold"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)",
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>

              <div className="text-start d-none d-md-block" style={{ lineHeight: 1.1 }}>
                <div className="fw-semibold" style={{ fontSize: 13 }}>
                  {userLabel}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.68)" }}>
                  Личный кабинет
                </div>
              </div>

              <i
                className={`fa ${
                  userMenuOpen ? "fa-chevron-up" : "fa-chevron-down"
                }`}
                style={{ fontSize: 12, color: "rgba(255,255,255,0.82)" }}
              />
            </button>

            {userMenuOpen && (
              <div
                className="position-absolute end-0 mt-2 bg-white rounded-4 shadow border overflow-hidden"
                style={{ minWidth: 280, zIndex: 1000 }}
              >
                <div
                  className="px-3 py-3 text-white"
                  style={{
                    background: "linear-gradient(135deg, #37474f, #546e7a)",
                  }}
                >
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="d-flex align-items-center justify-content-center fw-bold"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.18)",
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>

                    <div>
                      <div className="fw-semibold" style={{ fontSize: 14 }}>
                        {userLabel}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.82 }}>
                        {profile?.email ?? "Нет данных"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="py-2">
                  <Link
                    to="/profile"
                    className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none text-dark menu-link"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <i className="fa fa-id-card text-secondary" />
                    <span>Профиль</span>
                  </Link>

                  <Link
                    to="/settings"
                    className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none text-dark menu-link"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <i className="fa fa-gear text-secondary" />
                    <span>Настройки</span>
                  </Link>

                  <button
                    className="w-100 text-start border-0 bg-white d-flex align-items-center gap-3 px-3 py-2 text-danger menu-link"
                    onClick={() => void handleLogout()}
                  >
                    <i className="fa fa-right-from-bracket" />
                    <span>Выйти</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="container-fluid py-4 px-4 flex-grow-1 bg-light">
        {children}
      </div>

      <style>{`
        .layout-nav-default {
          color: rgba(255,255,255,0.72) !important;
          transition: all 0.18s ease;
        }

        .layout-nav-default:hover {
          color: #fff !important;
          background: rgba(255,255,255,0.10);
        }

        .layout-nav-active {
          color: #fff !important;
          background: rgba(255,255,255,0.16);
          font-weight: 600;
        }

        .profile-trigger {
          transition: background-color 0.18s ease;
        }

        .profile-trigger:hover {
          background: rgba(255,255,255,0.08);
        }

        .menu-link,
        .data-menu-link {
          transition: background-color 0.15s ease;
        }

        .menu-link:hover,
        .data-menu-link:hover {
          background-color: #f4f6f8;
        }
      `}</style>
    </div>
  );
}
