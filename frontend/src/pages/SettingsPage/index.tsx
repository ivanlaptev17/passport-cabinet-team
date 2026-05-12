import Layout from "../../components/Layout";

export default function SettingsPage() {
  return (
    <Layout>
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <h4 className="fw-semibold mb-3">Настройки</h4>
          <p className="text-muted mb-4">
            Здесь позже можно будет добавить редактирование профиля, смену пароля и другие пользовательские настройки.
          </p>

          <div className="card shadow-sm">
            <div className="card-body">
              <h6 className="fw-semibold mb-2">Раздел в разработке</h6>
              <p className="text-muted mb-0">
                Пока это каркас страницы настроек. Позже сюда можно вынести все параметры аккаунта.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}