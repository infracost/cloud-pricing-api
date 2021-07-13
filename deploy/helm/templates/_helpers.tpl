{{/*
Expand the name of the chart.
*/}}
{{- define "cloud-pricing-api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "cloud-pricing-api.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "cloud-pricing-api.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "cloud-pricing-api.labels" -}}
helm.sh/chart: {{ include "cloud-pricing-api.chart" . }}
{{ include "cloud-pricing-api.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "cloud-pricing-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cloud-pricing-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "cloud-pricing-api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cloud-pricing-api.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create a default fully qualified app name for the postgreSQL instance
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "cloud-pricing-api.postgresql.fullname" -}}
{{- if .Values.postgresql.fullnameOverride -}}
{{- .Values.postgresql.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default "postgresql" .Values.postgresql.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
Get PostgreSQL host
*/}}
{{- define "cloud-pricing-api.postgresql.host" -}}
{{- if .Values.postgresql.enabled -}}
  {{- printf "%s" (include "cloud-pricing-api.postgresql.fullname" .) -}}
{{- else -}}
  {{ .Values.postgresql.external.host }}
{{- end -}}
{{- end -}}

{{/*
Get PostgreSQL port
*/}}
{{- define "cloud-pricing-api.postgresql.port" -}}
{{- if .Values.postgresql.enabled -}}
  {{- printf "5432" | quote -}}
{{- else -}}
  {{ .Values.postgresql.external.port }}
{{- end -}}
{{- end -}}

{{/*
Get PostgreSQL database
*/}}
{{- define "cloud-pricing-api.postgresql.database" -}}
{{- if .Values.postgresql.enabled -}}
  {{- .Values.postgresql.postgresqlDatabase -}}
{{- else -}}
  {{ .Values.postgresql.external.database }}
{{- end -}}
{{- end -}}

{{/*
Get PostgreSQL user
*/}}
{{- define "cloud-pricing-api.postgresql.user" -}}
{{- if .Values.postgresql.enabled -}}
  {{- .Values.postgresql.postgresqlUsername -}}
{{- else -}}
  {{ .Values.postgresql.external.user }}
{{- end -}}
{{- end -}}

{{/*
Get the PostgreSQL secret name
*/}}
{{- define "cloud-pricing-api.postgresql.secretName" -}}
{{- if .Values.postgresql.enabled }}
    {{- if .Values.postgresql.existingSecret }}
        {{- printf "%s" .Values.postgresql.existingSecret -}}
    {{- else -}}
        {{- printf "%s" (include "cloud-pricing-api.postgresql.fullname" .) -}}
    {{- end -}}
{{- else -}}
    {{- printf "%s" (include "cloud-pricing-api.fullname" .) -}}
{{- end -}}
{{- end -}}
