import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import {
  fetchFinanceSummary,
  fetchUpcomingEvents,
  type FinanceSummary,
  type CalendarEvent,
} from "../../api/data";
import {
  fetchMyTasks,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type Task,
} from "../../api/tasks";

type CardProps = {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
};

const cardThemeMap: Record<string, { color: string; soft: string }> = {
  success: { color: "#198754", soft: "#e9f7ef" },
  danger: { color: "#dc3545", soft: "#fdecef" },
  primary: { color: "#0d6efd", soft: "#eaf2ff" },
  warning: { color: "#fd7e14", soft: "#fff3e0" },
  purple: { color: "#6f42c1", soft: "#f0ebff" },
  teal: { color: "#0d9488", soft: "#e6f7f6" },
};

function DashCard({ icon, color, title, subtitle, onClick }: CardProps) {
  const theme = cardThemeMap[color] ?? cardThemeMap.primary;

  return (
    <div className="col-xl-6 col-md-6 mb-3">
      <div
        className="card h-100 border-0 shadow-sm rounded-4 dashboard-action-card"
        style={{ cursor: "pointer", background: "#fff" }}
        onClick={onClick}
      >
        <div className="card-body d-flex align-items-center justify-content-between gap-3 p-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center rounded-4"
              style={{
                width: 48,
                height: 48,
                background: theme.soft,
                color: theme.color,
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              <i className={`fa ${icon}`} />
            </div>
            <div>
              <h6 className="mb-0 fw-bold" style={{ fontSize: 14 }}>
                {title}
              </h6>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {subtitle}
              </div>
            </div>
          </div>

          <div
            className="d-flex align-items-center justify-content-center rounded-circle dashboard-arrow"
            style={{
              width: 28,
              height: 28,
              background: "#f3f5f7",
              color: "#5f6b73",
              flexShrink: 0,
            }}
          >
            <i className="fa fa-arrow-right" style={{ fontSize: 10 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="col-12 mt-3 mb-1">
      <h6 className="fw-bold mb-0">{title}</h6>
      <p className="text-muted mb-0" style={{ fontSize: 13 }}>
        {subtitle}
      </p>
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function FinancePulse({ data }: { data: FinanceSummary | null }) {
  const isPositive = (data?.remainder ?? 0) >= 0;

  return (
    <div
      className="card border-0 shadow-sm rounded-4 h-100"
      style={{ background: "#fff" }}
    >
      <div className="card-body p-4">
        <div className="d-flex align-items-center gap-2 mb-4">
          <div
            className="d-flex align-items-center justify-content-center rounded-3"
            style={{
              width: 36,
              height: 36,
              background: "#fff3e0",
              color: "#fd7e14",
              fontSize: 16,
            }}
          >
            <i className="fa fa-chart-line" />
          </div>
          <div>
            <div className="fw-bold" style={{ fontSize: 15 }}>
              Финансовый пульс
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Остаток бюджета
            </div>
          </div>
        </div>

        {data == null ? (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm text-secondary" />
          </div>
        ) : (
          <>
            <div
              className="text-center mb-4"
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: isPositive ? "#198754" : "#dc3545",
                lineHeight: 1.1,
              }}
            >
              {isPositive ? "" : "−"}
              {fmt(Math.abs(data.remainder))}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: "#8c9aaa",
                  marginTop: 4,
                }}
              >
                руб.
              </div>
            </div>

            <div className="d-flex flex-column gap-2">
              <div
                className="d-flex justify-content-between align-items-center py-2 px-3 rounded-3"
                style={{ background: "#f8fafb" }}
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#198754",
                      display: "inline-block",
                    }}
                  />
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Субсидии
                  </span>
                </div>
                <span className="fw-semibold" style={{ fontSize: 13 }}>
                  {fmt(data.budget)} ₽
                </span>
              </div>

              <div
                className="d-flex justify-content-between align-items-center py-2 px-3 rounded-3"
                style={{ background: "#f8fafb" }}
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#dc3545",
                      display: "inline-block",
                    }}
                  />
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Расходы
                  </span>
                </div>
                <span className="fw-semibold" style={{ fontSize: 13 }}>
                  {fmt(data.expenses)} ₽
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div
                className="d-flex justify-content-between mb-1"
                style={{ fontSize: 11, color: "#8c9aaa" }}
              >
                <span>Использовано</span>
                <span>
                  {data.budget > 0
                    ? Math.round((data.expenses / data.budget) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="progress" style={{ height: 6, borderRadius: 99 }}>
                <div
                  className="progress-bar"
                  style={{
                    width: `${
                      data.budget > 0
                        ? Math.min((data.expenses / data.budget) * 100, 100)
                        : 0
                    }%`,
                    background: isPositive ? "#198754" : "#dc3545",
                    borderRadius: 99,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatWidgetDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function TasksWidget({
  items,
  onOpen,
}: {
  items: Task[] | null;
  onOpen: () => void;
}) {
  return (
    <div
      className="card border-0 shadow-sm rounded-4 mt-3 incidents-widget"
      style={{ background: "#fff", cursor: "pointer" }}
      onClick={onOpen}
    >
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div className="d-flex align-items-center gap-2">
            <div
              className="d-flex align-items-center justify-content-center rounded-3"
              style={{ width: 36, height: 36, background: "#e8eef5", color: "#37474f", fontSize: 16 }}
            >
              <i className="fa fa-clipboard-list" />
            </div>
            <div>
              <div className="fw-bold" style={{ fontSize: 15 }}>
                Задачи
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Ваши текущие задачи
              </div>
            </div>
          </div>

          <div
            className="d-flex align-items-center justify-content-center rounded-circle incidents-widget-arrow"
            style={{ width: 28, height: 28, background: "#f3f5f7", color: "#5f6b73", flexShrink: 0 }}
          >
            <i className="fa fa-arrow-right" style={{ fontSize: 10 }} />
          </div>
        </div>

        {items == null ? (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm text-secondary" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-4 px-3 py-4 text-center" style={{ background: "#f8fafb" }}>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Задач пока нет
            </div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {items.map((item) => {
              const overdue =
                !!item.due_at && item.status !== "DONE" && new Date(item.due_at) < new Date();

              return (
                <div
                  key={item.id}
                  className="rounded-4 px-3 py-3 incident-widget-row"
                  style={{
                    background: overdue ? "#fff5f5" : "#f8fafb",
                    border: overdue ? "1px solid #f5c2c7" : "1px solid #eef1f4",
                    borderLeft: overdue ? "3px solid #dc3545" : undefined,
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-semibold text-truncate" style={{ fontSize: 13 }}>
                        {item.title}
                      </div>
                      <div className="text-muted text-truncate" style={{ fontSize: 11 }}>
                        {item.building_name ?? item.organization}
                      </div>
                    </div>

                    <div
                      className="rounded-pill px-2 py-1"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: SEVERITY_COLORS[item.severity],
                        background: "#f3f5f7",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {SEVERITY_LABELS[item.severity]}
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center">
                    <div
                      className="rounded-pill px-2 py-1"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "white",
                        background: STATUS_COLORS[item.status],
                      }}
                    >
                      {STATUS_LABELS[item.status]}
                    </div>

                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {item.due_at ? formatWidgetDate(item.due_at) : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="d-flex justify-content-between align-items-center mt-3 pt-2"
          style={{ borderTop: "1px solid #eef1f4" }}
        >
          <span className="text-muted" style={{ fontSize: 12 }}>
            Открыть полный список
          </span>
          <i className="fa fa-chevron-right text-muted" style={{ fontSize: 11 }} />
        </div>
      </div>
    </div>
  );
}

function CalendarWidget({ events, onOpen }: { events: CalendarEvent[] | null; onOpen: () => void }) {
  const fmtDT = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) +
      " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const diffLabel = (s: string) => {
    const diff = Math.round((new Date(s).getTime() - Date.now()) / 86400000);
    if (diff === 0) return "сегодня";
    if (diff === 1) return "завтра";
    return `через ${diff} дн.`;
  };

  return (
    <div className="card border-0 shadow-sm rounded-4 mt-3" style={{ background: "#fff" }}>
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div className="d-flex align-items-center gap-2">
            <div className="d-flex align-items-center justify-content-center rounded-3"
              style={{ width: 36, height: 36, background: "#eaf2ff", color: "#0d6efd", fontSize: 16 }}>
              <i className="fa fa-calendar" />
            </div>
            <div>
              <div className="fw-bold" style={{ fontSize: 15 }}>Мероприятия</div>
              <div className="text-muted" style={{ fontSize: 12 }}>Ближайшие события</div>
            </div>
          </div>
          <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={onOpen} style={{ fontSize: 12 }}>
            Все
          </button>
        </div>

        {events == null ? (
          <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-secondary" /></div>
        ) : events.length === 0 ? (
          <div className="text-muted text-center py-2" style={{ fontSize: 13 }}>Нет ближайших мероприятий</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {events.map((e) => (
              <div key={e.id} className="d-flex align-items-start gap-2 py-2 px-3 rounded-3" style={{ background: "#f8fafb" }}>
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <span className="badge rounded-pill" style={{ background: "#eaf2ff", color: "#0d6efd", fontSize: 10 }}>
                    {diffLabel(e.starts_at)}
                  </span>
                </div>
                <div className="flex-grow-1 overflow-hidden">
                  <div className="fw-semibold text-truncate" style={{ fontSize: 13 }}>{e.title}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{fmtDT(e.starts_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    fetchFinanceSummary().then(setSummary).catch(() => null);
    fetchMyTasks()
      .then((list) => setTasks(list.filter((t) => t.status !== "DONE").slice(0, 5)))
      .catch(() => setTasks([]));
    fetchUpcomingEvents(3).then(setUpcomingEvents).catch(() => setUpcomingEvents([]));
  }, []);

  return (
    <Layout>
      <div className="row g-4">
        <div className="col-xl-9 col-lg-8">
          <div className="row g-0">

            {/* ── Быстрые действия ── */}
            <div className="col-12 mb-3">
              <div className="card border-0 shadow-sm rounded-4" style={{ background: "linear-gradient(135deg, #37474f, #546e7a)" }}>
                <div className="card-body p-4">
                  <div className="fw-bold text-white mb-1" style={{ fontSize: 15 }}>Быстрые действия</div>
                  <div className="text-white mb-3" style={{ fontSize: 12, opacity: 0.72 }}>Часто используемые функции</div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      className="btn btn-sm px-3 py-2 rounded-pill fw-semibold quick-action-btn"
                      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
                      onClick={() => navigate("/document-templates")}
                    >
                      <i className="fa fa-file-pen me-2" />
                      Создать приказ
                    </button>
                    <button
                      className="btn btn-sm px-3 py-2 rounded-pill fw-semibold quick-action-btn"
                      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
                      onClick={() => navigate("/calendar")}
                    >
                      <i className="fa fa-calendar-plus me-2" />
                      Назначить встречу
                    </button>
                    <button
                      className="btn btn-sm px-3 py-2 rounded-pill fw-semibold quick-action-btn"
                      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
                      onClick={() => navigate("/employees")}
                    >
                      <i className="fa fa-file-excel me-2" />
                      Выгрузить в Excel
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <SectionHeader
              title="Организация и МТБ"
              subtitle="Основные сведения об образовательной организации"
            />
            <div className="col-12">
              <div className="row">
                <DashCard
                  icon="fa-university"
                  color="success"
                  title="Организации"
                  subtitle="Сведения по ОО"
                  onClick={() => navigate("/organizations")}
                />
                <DashCard
                  icon="fa-building"
                  color="primary"
                  title="Здания"
                  subtitle="Материально-техническая база"
                  onClick={() => navigate("/buildings")}
                />
              </div>
            </div>

            <SectionHeader
              title="Кадровый состав"
              subtitle="Общие сведения и списки сотрудников"
            />
            <div className="col-12">
              <div className="row">
                <DashCard
                  icon="fa-table"
                  color="danger"
                  title="Общие сведения"
                  subtitle="Штатное расписание"
                  onClick={() => navigate("/staff-info")}
                />
                <DashCard
                  icon="fa-id-card"
                  color="danger"
                  title="Все сотрудники"
                  subtitle="Полный список"
                  onClick={() => navigate("/employees")}
                />
                <DashCard
                  icon="fa-user-tie"
                  color="danger"
                  title="АУП"
                  subtitle="Административно-управленческий"
                  onClick={() => navigate("/employees?cat=ADM")}
                />
                <DashCard
                  icon="fa-chalkboard-user"
                  color="danger"
                  title="Педагоги + УВП"
                  subtitle="Педагогический персонал"
                  onClick={() => navigate("/employees?cat=TEACH")}
                />
                <DashCard
                  icon="fa-wrench"
                  color="danger"
                  title="МОП"
                  subtitle="Младший обслуживающий"
                  onClick={() => navigate("/employees?cat=TECH")}
                />
              </div>
            </div>

            <SectionHeader
              title="Контингент обучающихся"
              subtitle="Численность, классы и параллели"
            />
            <div className="col-12">
              <div className="row">
                <DashCard
                  icon="fa-users"
                  color="teal"
                  title="Контингент"
                  subtitle="Общая численность"
                  onClick={() => navigate("/contingent")}
                />
                <DashCard
                  icon="fa-graduation-cap"
                  color="teal"
                  title="Классы и параллели"
                  subtitle="Классы по параллелям"
                  onClick={() => navigate("/contingent")}
                />
              </div>
            </div>

            <SectionHeader
              title="Образовательная деятельность"
              subtitle="Урочная, внеурочная и доп. образование"
            />
            <div className="col-12">
              <div className="row">
                <DashCard
                  icon="fa-book-open"
                  color="purple"
                  title="Образовательная деятельность"
                  subtitle="Все виды деятельности"
                  onClick={() => navigate("/education")}
                />
              </div>
            </div>

            <SectionHeader
              title="Финансовая деятельность"
              subtitle="Финансовые показатели, субсидии и контракты"
            />
            <div className="col-12">
              <div className="row">
                <DashCard
                  icon="fa-ruble-sign"
                  color="warning"
                  title="Финансовые записи"
                  subtitle="Расходы по разделам"
                  onClick={() => navigate("/finance")}
                />
                <DashCard
                  icon="fa-handshake"
                  color="warning"
                  title="Субсидии"
                  subtitle="Субсидии и финансирование"
                  onClick={() => navigate("/finance")}
                />
                <DashCard
                  icon="fa-file-contract"
                  color="warning"
                  title="Контракты"
                  subtitle="Заключённые договоры"
                  onClick={() => navigate("/finance")}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-lg-4">
          <div style={{ position: "sticky", top: 24 }}>
            <FinancePulse data={summary} />
            <CalendarWidget events={upcomingEvents} onOpen={() => navigate("/calendar")} />
            <TasksWidget items={tasks} onOpen={() => navigate("/tasks")} />
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-action-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .dashboard-action-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 0.7rem 1.4rem rgba(55,71,79,0.10) !important;
        }

        .dashboard-action-card:hover .dashboard-arrow {
          background: #37474f;
          color: #fff !important;
        }

        .dashboard-arrow {
          transition: all 0.18s ease;
        }

        .incidents-widget {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .incidents-widget:hover {
          transform: translateY(-2px);
          box-shadow: 0 0.7rem 1.4rem rgba(55,71,79,0.10) !important;
        }

        .incidents-widget-arrow {
          transition: all 0.18s ease;
        }

        .incidents-widget:hover .incidents-widget-arrow {
          background: #37474f;
          color: #fff !important;
        }

        .incident-widget-row {
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }

        .incidents-widget:hover .incident-widget-row {
          box-shadow: 0 0.35rem 0.9rem rgba(55,71,79,0.05);
        }

        .quick-action-btn {
          transition: background 0.18s ease, transform 0.18s ease;
        }

        .quick-action-btn:hover {
          background: rgba(255,255,255,0.28) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </Layout>
  );
}
