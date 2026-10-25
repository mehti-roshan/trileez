from pathlib import Path
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


PDF_SKILL = Path('/home/mehti/.gapcode/plugins/cache/gapgpt/pdf/26.722.10000/skills/pdf')
sys.path.insert(0, str(PDF_SKILL / 'scripts'))

from fa_pdf import persian_digits, register_persian_fonts, rtl_line  # noqa: E402


OUTPUT_DIR = Path(__file__).resolve().parents[1] / 'public' / 'mock' / 'resumes'
ACCENT = colors.HexColor('#2563EB')
TEXT = colors.HexColor('#172033')
MUTED = colors.HexColor('#667085')
SURFACE = colors.HexColor('#F5F7FA')

PROFILES = [
    ('سعید احمدی', 'توسعه‌دهنده فرانت‌اند', '۵ سال تجربه در توسعه محصولات سازمانی با React و TypeScript', ['React و TypeScript', 'طراحی رابط کاربری', 'تست نرم‌افزار']),
    ('نگین کاظمی', 'کارشناس موفقیت مشتری', '۴ سال تجربه در استقرار، آموزش و پشتیبانی مشتریان سازمانی', ['مدیریت ارتباط با مشتری', 'آموزش محصول', 'تحلیل بازخورد']),
    ('پویان مرادی', 'کارشناس فروش سازمانی', '۶ سال تجربه در فروش راهکارهای نرم‌افزاری و مذاکره تجاری', ['فروش سازمانی', 'مذاکره قرارداد', 'مدیریت سرنخ']),
    ('مینا رستمی', 'طراح محصول', '۴ سال تجربه در پژوهش کاربر و طراحی سامانه‌های تحت وب', ['طراحی تجربه کاربر', 'Figma', 'سیستم طراحی']),
    ('هومن اکبری', 'مدیر پروژه', '۷ سال تجربه در برنامه‌ریزی و تحویل پروژه‌های نرم‌افزاری', ['مدیریت چابک', 'کنترل زمان و هزینه', 'رهبری تیم']),
    ('پرستو زمانی', 'کارشناس منابع انسانی', '۵ سال تجربه در جذب، توسعه استعداد و عملیات منابع انسانی', ['جذب و استخدام', 'مدیریت عملکرد', 'توسعه کارکنان']),
    ('امیرحسین کاوه', 'توسعه‌دهنده بک‌اند', '۵ سال تجربه در طراحی API و سامانه‌های مقیاس‌پذیر', ['Node.js', 'طراحی پایگاه داده', 'معماری نرم‌افزار']),
]


def draw_resume(path: Path, name: str, title: str, summary: str, skills: list[str]) -> None:
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.setTitle(f'Resume - {name}')
    pdf.setAuthor('Trileez Mock Data')

    pdf.setFillColor(ACCENT)
    pdf.rect(0, height - 118, width, 118, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont('Vazirmatn-Bold', 22)
    pdf.drawRightString(width - 42, height - 55, rtl_line(name))
    pdf.setFont('Vazirmatn', 12)
    pdf.drawRightString(width - 42, height - 82, rtl_line(title))
    pdf.setFont('Vazirmatn', 9)
    pdf.drawRightString(width - 42, height - 101, rtl_line('رزومه آزمایشی برای پیش‌نمایش سامانه استخدام'))

    y = height - 158
    pdf.setFillColor(TEXT)
    pdf.setFont('Vazirmatn-Bold', 14)
    pdf.drawRightString(width - 42, y, rtl_line('خلاصه حرفه‌ای'))
    y -= 25
    pdf.setFillColor(MUTED)
    pdf.setFont('Vazirmatn', 10.5)
    pdf.drawRightString(width - 42, y, rtl_line(summary))

    y -= 48
    pdf.setFillColor(TEXT)
    pdf.setFont('Vazirmatn-Bold', 14)
    pdf.drawRightString(width - 42, y, rtl_line('مهارت‌ها'))
    y -= 25
    for skill in skills:
        pdf.setFillColor(SURFACE)
        pdf.roundRect(width - 270, y - 8, 228, 25, 7, fill=1, stroke=0)
        pdf.setFillColor(TEXT)
        pdf.setFont('Vazirmatn', 10)
        pdf.drawRightString(width - 54, y, rtl_line(f'• {skill}'))
        y -= 34

    y -= 12
    pdf.setFillColor(TEXT)
    pdf.setFont('Vazirmatn-Bold', 14)
    pdf.drawRightString(width - 42, y, rtl_line('سوابق کاری'))
    y -= 26
    pdf.setFont('Vazirmatn-Bold', 10.5)
    pdf.drawRightString(width - 42, y, rtl_line(f'{title} — شرکت نمونه فناوری'))
    pdf.setFillColor(MUTED)
    pdf.setFont('Vazirmatn', 9.5)
    pdf.drawString(42, y, rtl_line(persian_digits('۱۴۰۱ تا ۱۴۰۵')))
    y -= 22
    pdf.drawRightString(width - 42, y, rtl_line('همکاری در تحلیل، اجرا و تحویل خروجی‌های محصول با تیم‌های چندتخصصی'))

    y -= 48
    pdf.setFillColor(TEXT)
    pdf.setFont('Vazirmatn-Bold', 14)
    pdf.drawRightString(width - 42, y, rtl_line('تحصیلات'))
    y -= 25
    pdf.setFillColor(MUTED)
    pdf.setFont('Vazirmatn', 10)
    pdf.drawRightString(width - 42, y, rtl_line('کارشناسی مهندسی کامپیوتر — دانشگاه نمونه'))

    pdf.setStrokeColor(colors.HexColor('#D8DEE8'))
    pdf.line(42, 52, width - 42, 52)
    pdf.setFillColor(MUTED)
    pdf.setFont('Vazirmatn', 8.5)
    pdf.drawRightString(width - 42, 34, rtl_line('این فایل صرفاً داده آزمایشی سامانه است و به شخص واقعی تعلق ندارد.'))
    pdf.save()


def main() -> None:
    register_persian_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, profile in enumerate(PROFILES, start=1):
        draw_resume(OUTPUT_DIR / f'resume-sample-{index}.pdf', *profile)


if __name__ == '__main__':
    main()
