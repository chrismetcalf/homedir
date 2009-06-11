package Recs::Operation;

use strict;
use warnings;

use Recs::InputStream;
use Getopt::Long;
use Carp;

sub accept_record {
   subclass_should_implement(shift);
}

sub usage {
   subclass_should_implement(shift);
}

sub new {
   my $class = shift;
   my $args  = shift;

   my $this = {
   };

   bless $this, $class;

   $this->init($args);
   return $this;
}

sub parse_options {
   my $this         = shift;
   my $args         = shift || [];
   my $options_spec = shift || {};

   $options_spec->{'help'} ||= sub { $this->_set_wants_help(1); };

   local @ARGV = @$args;
   GetOptions(%$options_spec);

   $this->_set_extra_args(\@ARGV);
}

sub _set_wants_help {
   my $this = shift;
   my $help = shift;

   $this->{'WANTS_HELP'} = $help;
}

sub get_wants_help {
   my $this = shift;
   return $this->{'WANTS_HELP'};
}

sub _set_exit_value {
   my $this  = shift;
   my $value = shift;

   $this->{'EXIT_VALUE'} = $value;
}

sub get_exit_value {
   my $this = shift;
   return $this->{'EXIT_VALUE'} || 0;
}

sub print_usage {
   my $class   = shift;
   my $message = shift;

   if ( $message ) {
      print "$message\n";
   }

   print $class->usage();
   exit 1;
}

sub init {
}

sub finish {
   my $this = shift;
   $this->stream_done();
   $this->_get_next_operation()->finish();
}

sub get_input_stream {
   my $this = shift;
   $this->{'INPUT_STREAM'} ||= Recs::InputStream->new_magic($this->_get_extra_args());
   return $this->{'INPUT_STREAM'};
}

sub set_input_stream {
   my $this   = shift;
   my $stream = shift;
   $this->{'INPUT_STREAM'} = $stream;
}

sub run_operation {
   my $this = shift;

   my $input = $this->get_input_stream(); 

   while ( my $record = $input->get_record() ) {
      $this->accept_record($record);
   }
}

sub subclass_should_implement {
   my $this = shift;
   croak "Subclass should implement: " . ref($this);
}

sub stream_done {
}

sub push_record {
   my $this   = shift;
   my $record = shift;

   $this->_get_next_operation()->accept_record($record);
}

sub _get_next_operation {
   my $this = shift;

   unless ( $this->{'NEXT'} ) {
      require Recs::Operation::Printer;
      $this->{'NEXT'} = Recs::Operation::Printer->new();
   }

   return $this->{'NEXT'};
}

sub create_operation {
   my $class  = shift;
   my $script = shift;
   my @args   = @_;

   my $operation = $script;

   die "Script not named recs-*: $script" unless ( $script =~ s/^recs-// );

   my $module = "Recs::Operation::$script";
   eval "require $module";
   if ( $@ ) {
      die "Could not load $module: $@";
   }

   my $op;
   eval {
      $op = $module->new(\@args);
   };

   if ( $@ || $op->get_wants_help() ) {
      $module->print_usage($@);
   }

   return $op;
}

sub _set_next_operation {
   my $this = shift;
   my $next = shift;

   $this->{'NEXT'} = $next;
}

sub _set_extra_args {
   my $this = shift;
   my $args = shift;

   $this->{'EXTRA_ARGS'} = $args;
}

sub _get_extra_args {
   my $this = shift;
   return $this->{'EXTRA_ARGS'};
}

1;
