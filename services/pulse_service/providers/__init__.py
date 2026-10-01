"""Provider adapters: maps, WhatsApp, payments, push, mail.

Each adapter answers the same three questions: are you configured, what did the
provider actually say, and what should the caller tell a human. None of them may
return invented data when unconfigured — they raise ServiceError with source set to
the provider name.
"""
