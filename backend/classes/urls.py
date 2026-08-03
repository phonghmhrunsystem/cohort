from django.urls import path

from .views import ClassDetailView, ClassesView, ClassResourceDetailView, ClassResourceDownloadView, ClassResourcesView, ClassStatusView, EnrollmentView, GradebookCsvView, GradebookView, StudentDetailView, StudentsView


urlpatterns = [
    path("classes", ClassesView.as_view()),
    path("classes/<int:class_id>", ClassDetailView.as_view()),
    path("classes/<int:class_id>/status", ClassStatusView.as_view()),
    path("classes/<int:class_id>/gradebook", GradebookView.as_view()),
    path("classes/<int:class_id>/gradebook.csv", GradebookCsvView.as_view()),
    path("classes/<int:class_id>/students", StudentsView.as_view()),
    path("classes/<int:class_id>/students/<int:student_id>", StudentDetailView.as_view()),
    path("classes/<int:class_id>/enrollments", EnrollmentView.as_view()),
    path("classes/<int:class_id>/enrollments/<int:student_id>", EnrollmentView.as_view()),
    path("classes/<int:class_id>/resources", ClassResourcesView.as_view()),
    path("classes/<int:class_id>/resources/<int:resource_id>", ClassResourceDetailView.as_view()),
    path("classes/<int:class_id>/resources/<int:resource_id>/download", ClassResourceDownloadView.as_view()),
]
