variable "service" {
  type        = string
  description = "the name of the service for whom this queue is being provisioned. for example: 'svc-notifications'"
}
variable "environment" {
  type        = string
  description = "the name of the environment in which this queue is being provisioned. for example: 'dev', 'prod', 'test', etc"
}
variable "title" {
  type        = string
  description = "a distinct name that explains what type of messages you will find in this queue. for example: 'async-task-remind-user-to-brush-teeth'"
}
variable "tags" {
  type        = map(any)
  description = "tags to help you categorize your resources"
}
variable "visibility_timeout_seconds" {
  type        = number
  default     = 30 # the aws default
  description = "how long to keep a message invisible after it is read. i.e., the period of time between retries in processing the same message"
}
variable "message_retention_seconds" {
  type        = number
  default     = 1209600 # the aws default
  description = "how long messages stay in the queue before expiring without being removed"
}
variable "delay_seconds" {
  type        = number
  default     = 0 # the aws default
  description = "the number of seconds between the time the message is added to the queue and the time the message is available for being read from the queue"
}
variable "max_receive_count" {
  type        = number
  default     = 3 # a lucky number
  description = "the number of times to try to process the message before moving it into the dead letter queue"
}


