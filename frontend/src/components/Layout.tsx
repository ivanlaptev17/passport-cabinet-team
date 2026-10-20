import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { logoutUser } from "../api/auth";
import { fetchProfile, type Profile } from "../api/data";
import { fetchOmsuMunicipalities } from "../api/omsu";
import NotificationBell from "./NotificationBell";
import Footer from "./Footer";
import OrgPicker from "./OrgPicker";
import { useOrgScope } from "../hooks/useOrgScope";
import { setActiveOrg } from "../utils/activeOrg";

type Props = { children: ReactNode };

// Разделы, которые открываются без выбранной организации
const OPEN_WITHOUT_ORG = ["/dashboard", "/omsu", "/profile", "/settings"];
// ОМСУ работает только со своим разделом
const OMSU_PAGES = ["/omsu", "/profile", "/settings"];

function NavItem({
  to,
  icon,
  label,
  active,
  disabled,
}: {
  to: string;
  icon: string;
  label: string;
  active: boolean;
  disabled?: boolean;
}) {
  const className = `nav-link px-2 py-2 rounded-pill ${active ? "layout-nav-active" : "layout-nav-default"}`;
  return (
    <li className="nav-item">
      {disabled ? (
        <span className={`${className} layout-nav-disabled`} title={`${label}: сначала выберите организацию`}>
          <i className={`fa ${icon} me-xl-2`} />
          <span className="d-none d-xl-inline">{label}</span>
        </span>
      ) : (
        <Link to={to} title={label} className={className}>
          <i className={`fa ${icon} me-xl-2`} />
          <span className="d-none d-xl-inline">{label}</span>
        </Link>
      )}
    </li>
  );
}

export default function Layout({ children }: Props) {
  const { pathname, search } = useLocation();
  const scope = useOrgScope();
  const { isGlobal, isOmsu, context, active, needsOrg, canSwitch, canStaffCalendar } = scope;

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [omsuRegion, setOmsuRegion] = useState<string | null>(null);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const dataMenuRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => null);
  }, []);

  useEffect(() => {
    if (!isOmsu) return;
    let alive = true;
    fetchOmsuMunicipalities()
      .then((list) => alive && setOmsuRegion(list[0]?.name ?? null))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [isOmsu]);

  // Сотруднику школы организация подставляется сама: своя, а при нескольких —
  // та, что выбрана, если она ещё его. Министерство выбирает само, мы только
  // убираем выбор, если такой организации больше нет
  useEffect(() => {
    if (!context || isOmsu) return;
    const orgs = context.organizations;
    const found = active ? orgs.find((o) => o.id === active.id) : undefined;
    if (isGlobal) {
      if (active && !found) setActiveOrg(null);
      else if (found) setActiveOrg({ id: found.id, name: found.name, municipalities: found.municipalities });
      return;
    }
    const pick = found ?? orgs[0];
    setActiveOrg(pick ? { id: pick.id, name: pick.name, municipalities: pick.municipalities } : null);
  }, [context, active, isGlobal, isOmsu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) setUserMenuOpen(false);
      if (dataMenuRef.current && !dataMenuRef.current.contains(target)) setDataMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      // следующий вошедший в этом браузере не должен унаследовать чужой выбор
      setActiveOrg(null);
      window.location.href = "/";
    }
  };

  if (isOmsu && !OMSU_PAGES.includes(pathname)) {
    return <Navigate to="/omsu" replace />;
  }

  const blocked = needsOrg && !OPEN_WITHOUT_ORG.includes(pathname);

  // Управление — Администратору и Директору выбранной организации
  const canManageOrg = isGlobal ? !!context?.is_global_admin : !!scope.activePerms?.can_manage;

  const isDataActive =
    pathname.startsWith("/organizations") || pathname.startsWith("/employees") || pathname.startsWith("/buildings");

  const fullName = [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") || null;
  const userLabel = fullName || profile?.email || "Аккаунт";
  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
    (profile?.email?.[0]?.toUpperCase() ?? "U");

  const closeDataMenu = () => setDataMenuOpen(false);
  const dataLinkClass = (isActive = false) =>
    `d-flex align-items-center gap-2 px-3 py-2 text-decoration-none ${isActive ? "text-dark fw-semibold" : "text-dark"} data-menu-link`;

  const isEmployeesAllActive = pathname === "/employees" && !search;
  const isAdmActive = pathname === "/employees" && search.includes("cat=ADM");
  const isTeachActive = pathname === "/employees" && search.includes("cat=TEACH");
  const isTechActive = pathname === "/employees" && search.includes("cat=TECH");

  return (
    <div className="d-flex flex-column min-vh-100">
      <div className="sticky-top">
        <nav className="navbar navbar-dark shadow-sm" style={{ background: "linear-gradient(135deg, #37474f, #455a64)" }}>
          <div className="container-fluid px-4 py-2">
            <ul className="navbar-nav flex-row gap-1 me-auto align-items-center flex-wrap">
              {isOmsu ? (
                <NavItem to="/omsu" icon="fa-landmark" label="ОМСУ" active={pathname === "/omsu"} />
              ) : (
                <>
                  <NavItem to="/dashboard" icon="fa-house" label="Главная" active={pathname === "/dashboard"} />
                  {isGlobal && <NavItem to="/omsu" icon="fa-landmark" label="ОМСУ" active={pathname === "/omsu"} />}
                  <NavItem to="/calendar" icon="fa-calendar" label="Календарь" active={pathname === "/calendar"} disabled={needsOrg} />
                  <NavItem to="/documents" icon="fa-folder-open" label="Документы" active={pathname === "/documents"} disabled={needsOrg} />
                  <NavItem
                    to="/document-templates"
                    icon="fa-file-pen"
                    label="Конструктор"
                    active={pathname === "/document-templates"}
                    disabled={needsOrg}
                  />
                  <NavItem to="/tasks" icon="fa-clipboard-list" label="Задачи" active={pathname.startsWith("/tasks")} disabled={needsOrg} />
                  {canStaffCalendar && (
                    <NavItem
                      to="/staff-calendar"
                      icon="fa-umbrella-beach"
                      label="Отпуска и ДР"
                      active={pathname === "/staff-calendar"}
                      disabled={needsOrg}
                    />
                  )}
                  {canManageOrg && (
                    <NavItem to="/org-admin" icon="fa-users-gear" label="Управление" active={pathname === "/org-admin"} disabled={needsOrg} />
                  )}

                  <li className="nav-item position-relative" ref={dataMenuRef}>
                    {needsOrg ? (
                      <span className="nav-link px-2 py-2 rounded-pill layout-nav-default layout-nav-disabled" title="Данные: сначала выберите организацию">
                        <i className="fa fa-database me-xl-2" />
                        <span className="d-none d-xl-inline">Данные</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Данные"
                        className={`nav-link px-2 py-2 rounded-pill border-0 d-flex align-items-center ${
                          isDataActive ? "layout-nav-active" : "layout-nav-default"
                        }`}
                        style={{ background: "transparent" }}
                        onClick={() => setDataMenuOpen((prev) => !prev)}
                      >
                        <i className="fa fa-database me-xl-2" />
                        <span className="d-none d-xl-inline">Данные</span>
                        <i className={`fa ${dataMenuOpen ? "fa-chevron-up" : "fa-chevron-down"} ms-1 ms-xl-2`} style={{ fontSize: 11 }} />
                      </button>
                    )}

                    {dataMenuOpen && (
                      <div className="position-absolute start-0 mt-2 bg-white rounded-4 shadow border overflow-hidden" style={{ minWidth: 420, zIndex: 1000 }}>
                        <div className="px-3 pt-3 pb-2 text-uppercase text-muted fw-semibold small">Кадровый состав</div>
                        <Link to="/employees" className={dataLinkClass(isEmployeesAllActive)} onClick={closeDataMenu}>
                          <i className="fa fa-id-card text-secondary" />
                          <span>Все сотрудники</span>
                        </Link>
                        <Link to="/employees?cat=ADM" className={dataLinkClass(isAdmActive)} onClick={closeDataMenu}>
                          <i className="fa fa-user-tie text-secondary" />
                          <span>Административно-управленческий персонал</span>
                        </Link>
                        <Link to="/employees?cat=TEACH" className={dataLinkClass(isTeachActive)} onClick={closeDataMenu}>
                          <i className="fa fa-chalkboard-user text-secondary" />
                          <span>Педагогические кадры + УВП</span>
                        </Link>
                        <Link to="/employees?cat=TECH" className={dataLinkClass(isTechActive)} onClick={closeDataMenu}>
                          <i className="fa fa-wrench text-secondary" />
                          <span>Младший обслуживающий персонал</span>
                        </Link>

                        <div className="px-3 pt-3 pb-2 text-uppercase text-muted fw-semibold small border-top">Материально-техническая база</div>
                        <Link to="/organizations" className={dataLinkClass(pathname === "/organizations")} onClick={closeDataMenu}>
                          <i className="fa fa-university text-secondary" />
                          <span>Образовательные организации</span>
                        </Link>
                        <Link to="/buildings" className={dataLinkClass(pathname === "/buildings")} onClick={closeDataMenu}>
                          <i className="fa fa-building text-secondary" />
                          <span>Здания</span>
                        </Link>
                      </div>
                    )}
                  </li>
                </>
              )}
            </ul>

            {!isOmsu && <NotificationBell />}

            <div className="position-relative" ref={userMenuRef}>
              <button
                className="border-0 d-flex align-items-center gap-3 px-2 py-1 profile-trigger"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                style={{ background: "transparent", color: "white", borderRadius: 999 }}
              >
                <div
                  className="d-flex align-items-center justify-content-center fw-semibold"
                  style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.18)", fontSize: 14, flexShrink: 0 }}
                >
                  {initials}
                </div>
                {/* имя — только на широком экране: с вкладками шапка иначе переносится на вторую строку */}
                <div className="text-start d-none d-xxl-block" style={{ lineHeight: 1.1 }}>
                  <div className="fw-semibold" style={{ fontSize: 13 }}>{userLabel}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.68)" }}>Личный кабинет</div>
                </div>
                <i className={`fa ${userMenuOpen ? "fa-chevron-up" : "fa-chevron-down"}`} style={{ fontSize: 12, color: "rgba(255,255,255,0.82)" }} />
              </button>

              {userMenuOpen && (
                <div className="position-absolute end-0 mt-2 bg-white rounded-4 shadow border overflow-hidden" style={{ minWidth: 280, zIndex: 1000 }}>
                  <div className="px-3 py-3 text-white" style={{ background: "linear-gradient(135deg, #37474f, #546e7a)" }}>
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center fw-bold"
                        style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.18)", fontSize: 16, flexShrink: 0 }}
                      >
                        {initials}
                      </div>
                      <div>
                        <div className="fw-semibold" style={{ fontSize: 14 }}>{userLabel}</div>
                        <div style={{ fontSize: 12, opacity: 0.82 }}>{profile?.email ?? "Нет данных"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="py-2">
                    <Link to="/profile" className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none text-dark menu-link" onClick={() => setUserMenuOpen(false)}>
                      <i className="fa fa-id-card text-secondary" />
                      <span>Профиль</span>
                    </Link>
                    <Link to="/settings" className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none text-dark menu-link" onClick={() => setUserMenuOpen(false)}>
                      <i className="fa fa-gear text-secondary" />
                      <span>Настройки</span>
                    </Link>
                    <button className="w-100 text-start border-0 bg-white d-flex align-items-center gap-3 px-3 py-2 text-danger menu-link" onClick={() => void handleLogout()}>
                      <i className="fa fa-right-from-bracket" />
                      <span>Выйти</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* Организация — отдельным блоком, который «свисает» из шапки:
            сразу видно, данные какой школы на экране */}
        <div className="px-4 bg-light">
          <div className="org-tab d-inline-flex align-items-center gap-2 px-3 py-2">
            {isOmsu ? (
              <>
                <i className="fa fa-landmark" />
                <span className="fw-semibold text-truncate">ОМСУ{omsuRegion ? ` · ${omsuRegion}` : ""}</span>
              </>
            ) : active ? (
              <>
                <i className="fa fa-school" />
                <span className="text-truncate">
                  <span className="fw-semibold">{active.name}</span>
                  {active.municipalities && active.municipalities.length > 0 && (
                    <span className="org-tab-region ms-2">{active.municipalities.join(", ")}</span>
                  )}
                </span>
                {canSwitch && (
                  <button type="button" className="btn btn-sm org-tab-btn ms-1" onClick={() => setPickerOpen(true)}>
                    Сменить
                  </button>
                )}
              </>
            ) : isGlobal ? (
              <>
                <i className="fa fa-school" />
                <span className="org-tab-region">Организация не выбрана</span>
                <button type="button" className="btn btn-sm org-tab-btn ms-1" onClick={() => setPickerOpen(true)}>
                  Выбрать
                </button>
              </>
            ) : (
              <>
                <i className="fa fa-school" />
                <span className="org-tab-region">Вы не привязаны к организации</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container-fluid py-4 px-4 flex-grow-1 bg-light">
        {blocked ? (
          <div className="mx-auto text-center py-5" style={{ maxWidth: 460 }}>
            <i className="fa fa-school d-block mb-3" style={{ fontSize: 36, color: "#90a4ae" }} />
            <h6 className="fw-semibold">Выберите организацию</h6>
            <p className="text-muted" style={{ fontSize: 14 }}>
              Данные раздела показываются по одной организации. Выберите регион и школу — и раздел откроется.
            </p>
            <button className="btn text-white px-4" style={{ background: "#37474f" }} onClick={() => setPickerOpen(true)}>
              Выбрать организацию
            </button>
          </div>
        ) : (
          children
        )}
      </div>

      <Footer />

      {pickerOpen && <OrgPicker onClose={() => setPickerOpen(false)} />}

      <style>{`
        .layout-nav-default { color: rgba(255,255,255,0.72) !important; transition: all 0.18s ease; }
        .layout-nav-default:hover { color: #fff !important; background: rgba(255,255,255,0.10); }
        .layout-nav-active { color: #fff !important; background: rgba(255,255,255,0.16); font-weight: 600; }
        .layout-nav-disabled, .layout-nav-disabled:hover {
          color: rgba(255,255,255,0.32) !important; background: transparent; cursor: not-allowed;
        }
        .org-tab {
          background: linear-gradient(135deg, #455a64, #4e6470);
          color: #fff;
          border-radius: 0 0 14px 14px;
          font-size: 13px;
          max-width: 100%;
          box-shadow: 0 6px 14px rgba(55,71,79,0.18);
        }
        .org-tab-region { color: rgba(255,255,255,0.72); font-size: 12px; }
        .org-tab-btn {
          color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: 999px;
          font-size: 11px; padding: 1px 10px; flex-shrink: 0;
        }
        .org-tab-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
        .profile-trigger { transition: background-color 0.18s ease; }
        .profile-trigger:hover { background: rgba(255,255,255,0.08); }
        .menu-link, .data-menu-link { transition: background-color 0.15s ease; }
        .menu-link:hover, .data-menu-link:hover { background-color: #f4f6f8; }
      `}</style>
    </div>
  );
}
