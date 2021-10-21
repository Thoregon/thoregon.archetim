Collections
===========

## (async) iterator interface (pull)

implement
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncIterator
    
e.g. use with
    - aForEach()
    - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of

## stream interface (push, pull)

see @https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream 
implement both, push and pull 

## collection window interface (pull-push)

based on a collection. there are multiple providers supporting
different types of underlying collections.

the consumer of this interface moves the window over the collection.

it will get only events in relation to the content of the window.

properties for filter values can be defined
properties for sort directions can be defined

- open(handler)
- self learning window size


- setWindowSize(size)   can be resized
    - before and after buffer, usualy the buffer after is larger than before buffer
        - default: before = 1/2 window size, after = 1 window size
- scroll(number)    can be negative to scroll back
- close()

the handler will be called with

- append    at the end
- front     at the beginning
- posi

not:
- add       in the middle
- remove    in the middle

### window provider

implements retrival of entities to the underlying collection.
notify window of changes 

## usage

- window start with pos/key
- if new elements arrive, the first element must not move!
- if the first element got removed the following element moves up as first element

### handler

do the same as JS Array!
- length will be modified
- 'all' elements will be set to the position 

# Collection Aggregates

observes a collection and delivers reactive aggregated information
about the collection items

- count, also based on a filter
    - e.g. number of unread messages  
- sum of properties
