#Distex - Distributed Expression Library

## What is it?
A library which facilitates distributed events. In a distex system there are event clients, and event providers. Clients ask to be notified when some event occurs and providers are told a client is asking. If a provider is able to supply those events it responds and is awarded the contract. When it determines the event has occurred raises an event which propegates to the client. The system doesn't care what the events are, allowing clients and providers to arrange any notifications which they understand. For example a client may want to be notified when some cron spec is met, it would therefore request notifications for that spec, and a provider in the network which can understand cron specs might agree to notify it.

## Should I use it?
Probably not. It was really built for use in another of my projects https://github.com/Foo42/ContextEngine It's also probably pretty buggy at this stage
