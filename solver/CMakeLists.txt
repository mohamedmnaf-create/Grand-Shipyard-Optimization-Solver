cmake_minimum_required(VERSION 3.20)
project(OGC_Shipyard_Solver VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
file(GLOB_RECURSE SOURCES "src/*.cpp")

add_executable(shipyard_solver ${SOURCES})

# Include directories
target_include_directories(shipyard_solver PRIVATE src)

# Compiler optimization options
if(MSVC)
    target_compile_options(shipyard_solver PRIVATE /W4 /O2 /Oi /Ot /Gy)
else()
    target_compile_options(shipyard_solver PRIVATE -Wall -Wextra -O3 -march=native -pthread)
endif()

# Threading support
find_package(Threads REQUIRED)
target_link_libraries(shipyard_solver PRIVATE Threads::Threads)
