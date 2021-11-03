Persistence
===========


Store Object first time


Object

- split into simple and object (references) properties
- main entry contains
    - metadata
    - simple properties
- random value for each property key
    - property mapping in metadata (main entry)
- generate salt
- encrypt and sign Entry as JSON
- store main entry
- for all references
    - check if property in map exists
    - if not add mapping with random name
    - store reference

Iterable

- same as Object but
- properties get no mapping
- order of the entries will be maintained by the state (gun) 

Set property of object

- simple property
    - modify entries simple properties
    - encrypt, sing and store as JSON
- references
    - check if persistent

Get Object

Get Iterable


Listen to modifications

- add listener to gun when
    - object is created
    - object is read


FinalizationRegistry

- notify all listeners  
