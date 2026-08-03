"""Canonical demo roster used by the accounts seed migrations and seed_demo.

The roster is append-only: entries keep their position so the migrations that
index into it (classes/0001) and the email rename in accounts/0007 stay valid.
"""
import unicodedata

HOMETOWNS = [
    "Ha Noi", "TP. Ho Chi Minh", "Da Nang", "Hai Phong", "Can Tho",
    "Hue", "Nghe An", "Thanh Hoa", "Quang Ninh", "Binh Duong",
    "Dong Nai", "Khanh Hoa", "Lam Dong", "Nam Dinh", "Thai Binh",
]
PHONE_PREFIXES = ["090", "091", "093", "096", "097", "098", "032", "033", "086", "088"]

EMAIL_DOMAIN = "eduplatform.local"

# (display name with diacritics, gender) — gender is NAM / NU per accounts/serializers.py
ADMIN_NAME = ("Nguyễn Đức Phong", "NAM")

TEACHER_NAMES = [
    # the original five keep their position
    ("Trần Thị Minh Anh", "NU"), ("Lê Văn Hùng", "NAM"), ("Phạm Thị Thu Hương", "NU"),
    ("Hoàng Văn Đạt", "NAM"), ("Vũ Thị Ngọc Lan", "NU"),
    ("Đặng Minh Tuấn", "NAM"), ("Bùi Thị Kim Chi", "NU"), ("Ngô Quang Vinh", "NAM"),
    ("Lý Thị Hoài Thu", "NU"), ("Trịnh Văn Cường", "NAM"),
]

STUDENT_NAMES = [
    # the original forty keep their position
    ("Nguyễn Văn An", "NAM"), ("Trần Thị Bích", "NU"), ("Lê Minh Khoa", "NAM"),
    ("Phạm Thị Diệu", "NU"), ("Hoàng Văn Long", "NAM"), ("Huỳnh Thị Cẩm Tú", "NU"),
    ("Phan Văn Đức", "NAM"), ("Vũ Thị Hồng Nhung", "NU"), ("Võ Văn Kiên", "NAM"),
    ("Đặng Thị Yến", "NU"), ("Bùi Văn Tài", "NAM"), ("Đỗ Thị Quỳnh", "NU"),
    ("Hồ Văn Nam", "NAM"), ("Ngô Thị Mai", "NU"), ("Dương Văn Sơn", "NAM"),
    ("Lý Thị Trang", "NU"), ("Nguyễn Thị Thảo", "NU"), ("Trần Văn Bảo", "NAM"),
    ("Lê Thị Vy", "NU"), ("Phạm Văn Duy", "NAM"), ("Hoàng Thị Ngọc Ánh", "NU"),
    ("Huỳnh Văn Phát", "NAM"), ("Vũ Thị Hạnh", "NU"), ("Võ Văn Thắng", "NAM"),
    ("Đặng Thị Thu Trang", "NU"), ("Bùi Văn Trung", "NAM"), ("Đỗ Thị Kim Ngân", "NU"),
    ("Hồ Văn Việt", "NAM"), ("Ngô Thị Bảo Trâm", "NU"), ("Dương Văn Khang", "NAM"),
    ("Lý Thị Uyên", "NU"), ("Nguyễn Văn Hiếu", "NAM"), ("Trần Thị My", "NU"),
    ("Lê Văn Quang", "NAM"), ("Phạm Thị Giang", "NU"), ("Hoàng Văn Tuấn", "NAM"),
    ("Huỳnh Thị Xuân Mai", "NU"), ("Phan Thị Nhi", "NU"), ("Vũ Văn Anh Khoa", "NAM"),
    ("Võ Thị Thanh Thư", "NU"),
    ("Nguyễn Thị Hồng Đào", "NU"), ("Trần Văn Lâm", "NAM"), ("Lê Thị Kiều Oanh", "NU"),
    ("Phạm Minh Nhật", "NAM"), ("Hoàng Thị Lệ Quyên", "NU"), ("Huỳnh Văn Đông", "NAM"),
    ("Phan Thị Thanh Hà", "NU"), ("Vũ Đình Hòa", "NAM"), ("Võ Thị Ngọc Diệp", "NU"),
    ("Đặng Văn Lộc", "NAM"), ("Bùi Thị Thúy Vân", "NU"), ("Đỗ Minh Tiến", "NAM"),
    ("Hồ Thị Ánh Nguyệt", "NU"), ("Ngô Văn Hoàng", "NAM"), ("Dương Thị Thu Hà", "NU"),
    ("Lý Văn Bình", "NAM"), ("Nguyễn Thị Mỹ Linh", "NU"), ("Trần Quốc Thái", "NAM"),
    ("Lê Thị Ngọc Hân", "NU"), ("Phạm Văn Sang", "NAM"), ("Hoàng Thị Kim Yến", "NU"),
    ("Huỳnh Minh Trí", "NAM"), ("Phan Thị Bảo Ngọc", "NU"), ("Vũ Văn Hải", "NAM"),
    ("Võ Thị Hồng Vân", "NU"), ("Đặng Thị Thảo Vy", "NU"), ("Bùi Văn Nghĩa", "NAM"),
    ("Đỗ Thị Lan Hương", "NU"), ("Hồ Minh Quân", "NAM"), ("Ngô Thị Kiều Trinh", "NU"),
    ("Dương Văn Phúc", "NAM"), ("Lý Thị Cẩm Ly", "NU"), ("Nguyễn Văn Đại", "NAM"),
    ("Trần Thị Tuyết Nhung", "NU"), ("Lê Văn Tùng", "NAM"), ("Phạm Thị Ngọc Trâm", "NU"),
    ("Hoàng Minh Đức", "NAM"), ("Huỳnh Thị Diễm My", "NU"), ("Phan Văn Thịnh", "NAM"),
    ("Vũ Thị Kim Anh", "NU"),
]


def strip_diacritics(name):
    """Vietnamese display name -> plain ASCII. NFD strips the tone marks; đ/Đ
    carry no combining mark of their own and have to be mapped by hand."""
    decomposed = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def email_local_part(display_name):
    """"Nguyễn Văn An" -> "annv": the given name, then the initials of every
    word before it, in order."""
    words = strip_diacritics(display_name).split()
    given, rest = words[-1], words[:-1]
    return (given + "".join(word[0] for word in rest)).lower()


def legacy_email(display_name):
    """The pre-annv address (`nguyen.van.an@...`), kept so accounts/0007 can find
    the rows it has to rename."""
    return f"{strip_diacritics(display_name).lower().replace(' ', '.')}@{EMAIL_DOMAIN}"


def _assign_emails(display_names):
    """Local parts can collide — two differently spelled names reduce to the same
    initials. The second one onwards takes a numeric suffix, stable because the
    roster is append-only."""
    seen, emails = {}, []
    for display_name in display_names:
        local = email_local_part(display_name)
        seen[local] = seen.get(local, 0) + 1
        suffix = "" if seen[local] == 1 else str(seen[local])
        emails.append(f"{local}{suffix}@{EMAIL_DOMAIN}")
    return emails


def build_roster():
    """Return 1 admin + 10 teachers + 80 students with full basic info."""
    entries = (
        [(ADMIN_NAME, "ADMIN", "Admin@123")]
        + [(name, "TEACHER", "Teacher@123") for name in TEACHER_NAMES]
        + [(name, "STUDENT", "Student@123") for name in STUDENT_NAMES]
    )
    emails = _assign_emails([display_name for (display_name, _), _, _ in entries])

    roster = []
    for i, (((display_name, gender), role, password), email) in enumerate(zip(entries, emails)):
        birth_year = 1985 + (i % 8) if role == "TEACHER" else 2000 + (i % 7)
        roster.append({
            "email": email,
            "password": password,
            "role": role,
            "full_name": display_name,
            "gender": gender,
            "phone": f"{PHONE_PREFIXES[i % len(PHONE_PREFIXES)]}{1000000 + i * 137:07d}",
            "date_of_birth": f"{birth_year:04d}-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}",
            "hometown": HOMETOWNS[i % len(HOMETOWNS)],
            "address": f"{100 + i} Duong Le Loi, {HOMETOWNS[i % len(HOMETOWNS)]}",
        })
    return roster
