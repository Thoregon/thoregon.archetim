Message Queue
=============

## connect MQ to a service object

the service object implements the offered functionality.

the consumer get a transparent proxy offering the service like its
localy available. 

## Channels


## History


## Controller


## Events & Actions



## Actions



# Add

## Kinds 

### Request/Response

- two parties
- exclusive communication

how it works

- service creates queue
    - define permissions (which pubkeys can request)
- client requests a 'private' queue
    - queue with one address will be created
- client requests work
    - service answers
- after work is done private Q will be dropped

### Publish/Subscribe

- one publisher
- many subscribers

### Push/Pull

- one client pushed task
- multiple workers produce
- client pulls results
