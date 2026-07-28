from django.urls import path

from .views import ClassDetailView, ClassesView, ClassResourcesView, EnrollmentView, StudentDetailView, StudentsView


urlpatterns = [
    path("classes", ClassesView.as_view()),
    path("classes/<int:class_id>", ClassDetailView.as_view()),
    path("classes/<int:class_id>/students", StudentsView.as_view()),
    path("classes/<int:class_id>/students/<int:student_id>", StudentDetailView.as_view()),
    path("classes/<int:class_id>/enrollments", EnrollmentView.as_view()),
    path("classes/<int:class_id>/enrollments/<int:student_id>", EnrollmentView.as_view()),
    path("classes/<int:class_id>/resources", ClassResourcesView.as_view()),
]
