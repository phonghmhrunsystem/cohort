from django.urls import path

from .views import CohortDetailView, CohortsView, EnrollmentView


urlpatterns = [
    path("cohorts", CohortsView.as_view()),
    path("cohorts/<int:cohort_id>", CohortDetailView.as_view()),
    path("cohorts/<int:cohort_id>/enrollments", EnrollmentView.as_view()),
]
