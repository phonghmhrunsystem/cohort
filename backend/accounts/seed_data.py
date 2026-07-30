"""Canonical demo roster used by the accounts seed migrations."""
import unicodedata

HOMETOWNS = [
    "Ha Noi", "TP. Ho Chi Minh", "Da Nang", "Hai Phong", "Can Tho",
    "Hue", "Nghe An", "Thanh Hoa", "Quang Ninh", "Binh Duong",
    "Dong Nai", "Khanh Hoa", "Lam Dong", "Nam Dinh", "Thai Binh",
]
PHONE_PREFIXES = ["090", "091", "093", "096", "097", "098", "032", "033", "086", "088"]

# (full_name, gender) — gender is one of NAM / NU per accounts/serializers.py
ROSTER_NAMES = [
    ("Nguyen Duc Phong", "NAM"),  # admin
    ("Tran Thi Minh Anh", "NU"), ("Le Van Hung", "NAM"), ("Pham Thi Thu Huong", "NU"),
    ("Hoang Van Dat", "NAM"), ("Vu Thi Ngoc Lan", "NU"),  # teachers
    ("Nguyen Van An", "NAM"), ("Tran Thi Bich", "NU"), ("Le Minh Khoa", "NAM"),
    ("Pham Thi Dieu", "NU"), ("Hoang Van Long", "NAM"), ("Huynh Thi Cam Tu", "NU"),
    ("Phan Van Duc", "NAM"), ("Vu Thi Hong Nhung", "NU"), ("Vo Van Kien", "NAM"),
    ("Dang Thi Yen", "NU"), ("Bui Van Tai", "NAM"), ("Do Thi Quynh", "NU"),
    ("Ho Van Nam", "NAM"), ("Ngo Thi Mai", "NU"), ("Duong Van Son", "NAM"),
    ("Ly Thi Trang", "NU"), ("Nguyen Thi Thao", "NU"), ("Tran Van Bao", "NAM"),
    ("Le Thi Vy", "NU"), ("Pham Van Duy", "NAM"), ("Hoang Thi Ngoc Anh", "NU"),
    ("Huynh Van Phat", "NAM"), ("Vu Thi Hanh", "NU"), ("Vo Van Thang", "NAM"),
    ("Dang Thi Thu Trang", "NU"), ("Bui Van Trung", "NAM"), ("Do Thi Kim Ngan", "NU"),
    ("Ho Van Viet", "NAM"), ("Ngo Thi Bao Tram", "NU"), ("Duong Van Khang", "NAM"),
    ("Ly Thi Uyen", "NU"), ("Nguyen Van Hieu", "NAM"), ("Tran Thi My", "NU"),
    ("Le Van Quang", "NAM"), ("Pham Thi Giang", "NU"), ("Hoang Van Tuan", "NAM"),
    ("Huynh Thi Xuan Mai", "NU"), ("Phan Thi Nhi", "NU"), ("Vu Van Anh Khoa", "NAM"),
    ("Vo Thi Thanh Thu", "NU"),  # students (40)
]

# display names keep Vietnamese diacritics; slugs above already are the plain-ASCII form
DISPLAY_NAMES = [
    "Nguyễn Đức Phong",
    "Trần Thị Minh Anh", "Lê Văn Hùng", "Phạm Thị Thu Hương", "Hoàng Văn Đạt", "Vũ Thị Ngọc Lan",
    "Nguyễn Văn An", "Trần Thị Bích", "Lê Minh Khoa", "Phạm Thị Diệu", "Hoàng Văn Long",
    "Huỳnh Thị Cẩm Tú", "Phan Văn Đức", "Vũ Thị Hồng Nhung", "Võ Văn Kiên", "Đặng Thị Yến",
    "Bùi Văn Tài", "Đỗ Thị Quỳnh", "Hồ Văn Nam", "Ngô Thị Mai", "Dương Văn Sơn",
    "Lý Thị Trang", "Nguyễn Thị Thảo", "Trần Văn Bảo", "Lê Thị Vy", "Phạm Văn Duy",
    "Hoàng Thị Ngọc Ánh", "Huỳnh Văn Phát", "Vũ Thị Hạnh", "Võ Văn Thắng", "Đặng Thị Thu Trang",
    "Bùi Văn Trung", "Đỗ Thị Kim Ngân", "Hồ Văn Việt", "Ngô Thị Bảo Trâm", "Dương Văn Khang",
    "Lý Thị Uyên", "Nguyễn Văn Hiếu", "Trần Thị My", "Lê Văn Quang", "Phạm Thị Giang",
    "Hoàng Văn Tuấn", "Huỳnh Thị Xuân Mai", "Phan Thị Nhi", "Vũ Văn Anh Khoa", "Võ Thị Thanh Thư",
]


def _slugify(ascii_name):
    return unicodedata.normalize("NFKD", ascii_name).lower().replace(" ", ".")


def build_roster():
    """Return 1 admin + 5 teachers + 40 students with full basic info."""
    roster = []
    for i, ((ascii_name, gender), display_name) in enumerate(zip(ROSTER_NAMES, DISPLAY_NAMES)):
        if i == 0:
            role, password, email = "ADMIN", "Admin@123", "phong@gmail.com"
        elif i <= 5:
            role, password = "TEACHER", "Teacher@123"
            email = f"{_slugify(ascii_name)}@eduplatform.local"
        else:
            role, password = "STUDENT", "Student@123"
            email = f"{_slugify(ascii_name)}@eduplatform.local"

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
