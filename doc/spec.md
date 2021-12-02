Archetim
========


provides a common API for entity (object) persistence

it provides also an SPI to be able to use multiple DB implementations

use [OWL](https://www.w3.org/OWL/) for descriptions


## Entity

An object with properties. 

## Collection

A collection of entities. Each item gets a generated arbitrary key.

Specialized case of entity. 

--> TravellingWindowList

## Dictionary

A Key/Value collection. 

A dictionary may be based on a collection acting as an index

it will automatically be maintained when the base collection is modified - either the collection items, or a property if an entity which is used for the key 

Specialized case of entiry. 

## Entity Factories

To take advantage of the benefits you need to create all entities using the 
archetim factories.


# Claims

- for a specific entity with its properties
- same for collections and dictionaries
- referenced entities may need another claim

