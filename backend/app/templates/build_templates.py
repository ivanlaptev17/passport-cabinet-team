"""Генерирует исходные .docx-шаблоны с плейсхолдерами docxtpl (Jinja2).

Запуск (один раз, чтобы создать/пересоздать файлы шаблонов):
    docker compose exec backend python -m app.templates.build_templates
"""

from pathlib import Path
from docx import Document
from docx.shared import Pt

OUT_DIR = Path(__file__).parent


def build_position_certificate():
    doc = Document()

    title = doc.add_heading("СПРАВКА", level=1)
    title.alignment = 1  # center

    doc.add_paragraph()

    p = doc.add_paragraph()
    p.add_run("Выдана ")
    p.add_run("{{ fio }}").bold = True
    p.add_run(" в том, что он(а) занимает должность ")
    p.add_run("{{ position }}").bold = True
    p.add_run(" в организации ")
    p.add_run("{{ organization_name }}").bold = True
    p.add_run(".")

    doc.add_paragraph()
    doc.add_paragraph("Справка выдана для предъявления по месту требования.")

    doc.add_paragraph()
    doc.add_paragraph("Дата выдачи: {{ issue_date }}")

    doc.add_paragraph()
    doc.add_paragraph()
    doc.add_paragraph("Директор ____________________ {{ director_name }}")

    doc.save(OUT_DIR / "position_certificate.docx")


def build_responsible_order():
    doc = Document()

    title = doc.add_heading("ПРИКАЗ № {{ order_number }}", level=1)
    title.alignment = 1  # center

    doc.add_paragraph("от {{ order_date }}")
    doc.add_paragraph("{{ organization_name }}")

    doc.add_paragraph()
    doc.add_paragraph(
        "В целях обеспечения безопасности образовательного процесса "
        "назначить ответственными лицами:"
    )
    doc.add_paragraph()

    # 4 строки: заголовок, маркер "{%tr for%}", повторяемая строка данных,
    # маркер "{%tr endfor%}". docxtpl схлопывает строки-маркеры в чистые
    # jinja-теги {% for %} / {% endfor %}, а строка данных между ними
    # повторяется для каждого элемента списка.
    table = doc.add_table(rows=4, cols=4)
    table.style = "Table Grid"

    header = table.rows[0].cells
    header[0].text = "№"
    header[1].text = "ФИО"
    header[2].text = "Должность"
    header[3].text = "Зона ответственности"
    for cell in header:
        for run in cell.paragraphs[0].runs:
            run.bold = True
            run.font.size = Pt(10)

    table.rows[1].cells[0].text = "{%tr for p in responsible_persons %}"

    body = table.rows[2].cells
    body[0].text = "{{ loop.index }}"
    body[1].text = "{{ p.fio }}"
    body[2].text = "{{ p.position }}"
    body[3].text = "{{ p.area }}"

    table.rows[3].cells[0].text = "{%tr endfor %}"

    doc.add_paragraph()
    doc.add_paragraph("Директор ____________________ {{ director_name }}")

    doc.save(OUT_DIR / "responsible_order.docx")


if __name__ == "__main__":
    build_position_certificate()
    build_responsible_order()
    print("OK: position_certificate.docx, responsible_order.docx")
